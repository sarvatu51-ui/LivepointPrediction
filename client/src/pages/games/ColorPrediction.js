import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import './ColorPrediction.css';

const NUM_MAP = {
  0:['violet','red'], 1:['green'], 2:['red'], 3:['green'], 4:['red'],
  5:['violet','green'], 6:['red'], 7:['green'], 8:['red'], 9:['green']
};
const COLOR_MULTS = { red:2.0, green:2.0, violet:4.5 };
const COLOR_BG = { red:'#e84545', green:'#35d07f', violet:'#9b59b6' };
const COLOR_EMOJI = { red:'🔴', green:'🟢', violet:'🟣' };

const ColorPrediction = ({ user, onPointsUpdate }) => {
  const [stake, setStake] = useState(50);
  const [countdown, setCountdown] = useState(30);
  const [phase, setPhase] = useState('betting');
  const [selected, setSelected] = useState(null);
  const [betPlaced, setBetPlaced] = useState(false);
  const [spinNum, setSpinNum] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [resultColors, setResultColors] = useState([]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([
    {n:5,c:['violet','green']},{n:2,c:['red']},{n:7,c:['green']},
    {n:0,c:['violet','red']},{n:4,c:['red']},{n:9,c:['green']},
    {n:1,c:['green']},{n:3,c:['green']}
  ]);

  const timerRef = useRef(null);
  const betRef = useRef(false);
  const selRef = useRef(null);
  const stakeRef = useRef(50);
  betRef.current = betPlaced;
  selRef.current = selected;
  stakeRef.current = stake;

  const startSpin = async () => {
    setPhase('spinning');
    setSpinning(true);
    setResultColors([]);
    let count = 0;
    const spinInt = setInterval(() => {
      setSpinNum(Math.floor(Math.random() * 10));
      count++;
      if (count >= 20) {
        clearInterval(spinInt);
        const n = Math.floor(Math.random() * 10);
        const cols = NUM_MAP[n];
        setSpinNum(n);
        setSpinning(false);
        setResultColors(cols);
        setHistory(prev => [{n, c:cols}, ...prev.slice(0,7)]);
        setPhase('result');

        // Save result to DB
        if (betRef.current && selRef.current) {
          const won = cols.includes(selRef.current);
          const mult = COLOR_MULTS[selRef.current];
          const s = stakeRef.current;
          setResult({ won, amount: won ? Math.floor(s*mult) : s, color:selRef.current, mult });

          api.post('/casino/play', {
            game: 'color_prediction',
            stake: s,
            multiplier: won ? mult : 0,
            result: won ? 'won' : 'lost'
          }).then(res => {
            onPointsUpdate(res.data.newPoints); // instant update
          }).catch(e => console.error('Color save error:', e));
        }

        setTimeout(startCycle, 4000);
      }
    }, 100);
  };

  const startCycle = () => {
    setCountdown(30);
    setPhase('betting');
    setSelected(null);
    setBetPlaced(false);
    setResult(null);
    setSpinNum(null);
    setResultColors([]);
    betRef.current = false;
    selRef.current = null;
    let cd = 30;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      cd--;
      setCountdown(cd);
      if (cd <= 0) { clearInterval(timerRef.current); startSpin(); }
    }, 1000);
  };

  useEffect(() => {
    startCycle();
    return () => clearInterval(timerRef.current);
  }, []); // eslint-disable-line

  const placeBet = (color) => {
    if (phase !== 'betting' || betPlaced || countdown < 3) return;
    if (stake > user.points) { alert('Not enough points!'); return; }
    setSelected(color);
    setBetPlaced(true);
    betRef.current = true;
    selRef.current = color;
  };

  const timerColor = () => {
    if (countdown > 20) return '#35d07f';
    if (countdown > 10) return '#f5c518';
    return '#e84545';
  };

  return (
    <div className="cl-game">
      <div className="cl-timer-row">
        <div>
          <div className="cl-period">Period #{Math.floor(Date.now()/30000)}</div>
          <div className="cl-phase-lbl">
            {phase==='betting'?'Place your bet!':phase==='spinning'?'Spinning...':'Result!'}
          </div>
        </div>
        <div className="cl-timer-circle" style={{borderColor:timerColor(), boxShadow:`0 0 15px ${timerColor()}40`}}>
          <span className="cl-timer-num" style={{color:timerColor()}}>
            {phase==='spinning'?'🎲':phase==='result'?'✓':countdown}
          </span>
        </div>
        {betPlaced && <div className="cl-bet-indicator">✅ {selected?.toUpperCase()}</div>}
      </div>

      <div className="cl-spin-area">
        {spinNum !== null ? (
          <>
            <div className={`cl-spin-num ${spinning?'spinning':'revealed'}`}>{spinNum}</div>
            {resultColors.length > 0 && (
              <div className="cl-result-badges">
                {resultColors.map(c => (
                  <span key={c} className="cl-cbadge" style={{background:COLOR_BG[c]}}>{c.toUpperCase()}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="cl-spin-placeholder">?</div>
        )}
      </div>

      {result && (
        <div className={`cl-result ${result.won?'won':'lost'}`}>
          {result.won
            ? `🎉 ${result.color.toUpperCase()} wins at ${result.mult}x — +${result.amount} pts!`
            : `💸 ${result.color.toUpperCase()} lost — -${result.amount} pts`}
        </div>
      )}

      <div className="cl-color-btns">
        {['red','violet','green'].map(color => (
          <button key={color}
            className={`cl-cbtn cl-${color} ${selected===color?'selected':''} ${betPlaced&&selected!==color?'dimmed':''}`}
            onClick={() => placeBet(color)}
            disabled={betPlaced||phase!=='betting'||countdown<3}>
            <span className="cl-cemoji">{COLOR_EMOJI[color]}</span>
            <span className="cl-clabel">{color.toUpperCase()}</span>
            <span className="cl-cmult">{COLOR_MULTS[color]}x</span>
          </button>
        ))}
      </div>

      <div className="cl-stake-row">
        <div>
          <div className="cl-lbl">STAKE</div>
          <input className="cl-input" type="number" value={stake}
            onChange={e => setStake(Math.max(1, parseInt(e.target.value)||1))}
            disabled={betPlaced||phase!=='betting'} />
        </div>
        <div className="cl-qbtns">
          {[10,50,100,500].map(s => (
            <button key={s} className={`cl-qbtn ${stake===s?'active':''}`}
              onClick={()=>setStake(s)} disabled={betPlaced||phase!=='betting'}>{s}</button>
          ))}
        </div>
      </div>

      <div className="cl-history">
        <div className="cl-hist-lbl">Recent results</div>
        <div className="cl-hist-row">
          {history.map((h,i) => (
            <div key={i} className="cl-hist-item">
              <div className="cl-hist-num">{h.n}</div>
              <div className="cl-hist-dots">
                {h.c.map(c => <span key={c} className="cl-hist-dot" style={{background:COLOR_BG[c]}} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ColorPrediction;
