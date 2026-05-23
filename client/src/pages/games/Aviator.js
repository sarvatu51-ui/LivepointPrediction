import React, { useState, useEffect, useRef } from 'react';
import api from '../../utils/api';
import './Aviator.css';

const Aviator = ({ user, onPointsUpdate }) => {
  const [stake, setStake] = useState(50);
  const [gameState, setGameState] = useState('waiting');
  const [mult, setMult] = useState(1.00);
  const [betPlaced, setBetPlaced] = useState(false);
  const [cashedOut, setCashedOut] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([1.02, 2.34, 8.44, 1.05, 3.21, 2.89, 12.3, 1.12]);
  const [planePos, setPlanePos] = useState({ x: 5, y: 5 });

  const canvasRef = useRef(null);
  const multRef = useRef(1.00);
  const betRef = useRef(false);
  const cashRef = useRef(false);
  const stakeRef = useRef(50);
  const crashPointRef = useRef(1);
  const trailRef = useRef([]);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);
  const startFlightRef = useRef(null);
  const startCountdownRef = useRef(null);

  multRef.current = mult;
  betRef.current = betPlaced;
  cashRef.current = cashedOut;
  stakeRef.current = stake;

  const generateCrash = () => {
    const r = Math.random();
    if (r < 0.01) return 1.00;
    return Math.max(1.00, 1 / (1 - r * 0.96));
  };

  const getColor = (m) => {
    if (m < 2) return '#4a90e2';
    if (m < 5) return '#35d07f';
    if (m < 10) return '#f5c518';
    return '#e84545';
  };

  const drawTrail = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const trail = trailRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (trail.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    trail.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = 'rgba(74,144,226,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineTo(trail[trail.length - 1].x, canvas.height);
    ctx.lineTo(trail[0].x, canvas.height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(74,144,226,0.07)';
    ctx.fill();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width || 600;
      canvas.height = rect.height || 240;
    }

    const handleCrash = async (finalMult) => {
      setGameState('crashed');
      setHistory(prev => [parseFloat(finalMult.toFixed(2)), ...prev.slice(0, 7)]);

      if (betRef.current && !cashRef.current) {
        // User lost — deduct stake from DB
        const s = stakeRef.current;
        setResult({ won: false, amount: s });
        try {
          const res = await api.post('/casino/play', {
            game: 'aviator', stake: s, multiplier: 0, result: 'lost'
          });
          onPointsUpdate(res.data.newPoints);
        } catch (e) { console.error('Aviator loss save error:', e); }
      }
      setTimeout(() => startCountdownRef.current(), 3000);
    };

    const flight = () => {
      crashPointRef.current = generateCrash();
      setGameState('flying');
      let current = 1.00;
      let px = 5, py = 5;
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        current = parseFloat((current + current * 0.01 + 0.006).toFixed(2));
        setMult(current);
        px = Math.min(px + 1.1, 78);
        py = Math.min(py + 0.9, 65);
        setPlanePos({ x: px, y: py });
        const c = canvasRef.current;
        if (c) {
          const cx = (px / 100) * c.width;
          const cy = c.height - (py / 100) * c.height;
          trailRef.current = [...trailRef.current.slice(-60), { x: cx, y: cy }];
          drawTrail();
        }
        if (current >= crashPointRef.current) {
          clearInterval(intervalRef.current);
          handleCrash(current);
        }
      }, 100);
    };
    startFlightRef.current = flight;

    const startCountdown = () => {
      setGameState('waiting');
      setMult(1.00);
      setBetPlaced(false);
      setCashedOut(false);
      setResult(null);
      setPlanePos({ x: 5, y: 5 });
      trailRef.current = [];
      betRef.current = false;
      cashRef.current = false;
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      let cd = 5;
      setCountdown(cd);
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        cd--;
        setCountdown(cd);
        if (cd <= 0) { clearInterval(timerRef.current); startFlightRef.current(); }
      }, 1000);
    };
    startCountdownRef.current = startCountdown;
    startCountdown();

    return () => { clearInterval(intervalRef.current); clearInterval(timerRef.current); };
  }, []); // eslint-disable-line

  const handleAction = async () => {
    if (gameState === 'waiting' && !betPlaced) {
      if (stake > user.points) { alert('Not enough points!'); return; }
      setBetPlaced(true);
      betRef.current = true;
    } else if (gameState === 'flying' && betPlaced && !cashedOut) {
      // Cash out — save to DB immediately
      setCashedOut(true);
      cashRef.current = true;
      const currentMult = multRef.current;
      const win = Math.floor(stake * currentMult);
      setResult({ won: true, amount: win, m: currentMult });
      try {
        const res = await api.post('/casino/play', {
          game: 'aviator', stake, multiplier: currentMult, result: 'won'
        });
        onPointsUpdate(res.data.newPoints); // instant update
      } catch (e) { console.error('Aviator cashout save error:', e); }
    }
  };

  const pillClass = (m) => m < 2 ? 'pill-low' : m < 5 ? 'pill-mid' : 'pill-high';

  const btnState = () => {
    if (gameState === 'flying' && betPlaced && !cashedOut) return 'cashout';
    if (gameState === 'waiting' && !betPlaced) return 'idle';
    return 'waiting';
  };

  const btnText = () => {
    if (gameState === 'flying' && betPlaced && !cashedOut) return `CASH OUT ${Math.floor(stake * mult)} PTS`;
    if (gameState === 'waiting' && !betPlaced) return `BET ${stake} PTS`;
    if (gameState === 'flying' && !betPlaced) return 'In Flight...';
    if (cashedOut) return 'Cashed Out ✓';
    if (betPlaced) return 'Bet Placed ✓';
    return 'Next round...';
  };

  return (
    <div className="av-game">
      <div className="av-history">
        {history.map((h, i) => (
          <span key={i} className={`av-pill ${pillClass(h)}`}>{h.toFixed(2)}x</span>
        ))}
      </div>
      <div className="av-canvas-wrap">
        <canvas ref={canvasRef} className="av-canvas" />
        {gameState === 'flying' && (
          <div className="av-plane" style={{ left: `${planePos.x}%`, bottom: `${planePos.y}%` }}>✈️</div>
        )}
        <div className="av-mult-center">
          {gameState === 'waiting' && (
            <div className="av-waiting">
              <div className="av-wait-label">NEXT ROUND IN</div>
              <div className="av-wait-num">{countdown}s</div>
            </div>
          )}
          {gameState === 'flying' && (
            <div className="av-live-mult" style={{ color: getColor(mult) }}>{mult.toFixed(2)}x</div>
          )}
          {gameState === 'crashed' && (
            <div className="av-crashed-wrap">
              <div className="av-crashed-label">FLEW AWAY</div>
              <div className="av-crashed-mult">{mult.toFixed(2)}x</div>
            </div>
          )}
        </div>
        {gameState === 'crashed' && <div className="av-explosion">💥</div>}
      </div>
      {result && (
        <div className={`av-result ${result.won ? 'won' : 'lost'}`}>
          {result.won
            ? `🎉 Cashed out at ${result.m?.toFixed(2)}x — Won ${result.amount} pts!`
            : `💸 Flew away! Lost ${result.amount} pts`}
        </div>
      )}
      <div className="av-controls">
        <div className="av-ctrl-left">
          <div className="av-ctrl-label">STAKE POINTS</div>
          <input className="av-input" type="number" value={stake}
            onChange={e => setStake(Math.max(1, parseInt(e.target.value) || 1))}
            disabled={betPlaced} />
          <div className="av-qbtns">
            {[10, 50, 100, 500].map(s => (
              <button key={s} className={`av-qbtn ${stake === s ? 'active' : ''}`}
                onClick={() => setStake(s)} disabled={betPlaced}>{s}</button>
            ))}
          </div>
        </div>
        <div className="av-ctrl-right">
          <div className="av-stat-box">
            <div className="av-stat-label">CURRENT MULT</div>
            <div className="av-stat-val" style={{ color: getColor(mult) }}>{mult.toFixed(2)}x</div>
          </div>
          <div className="av-stat-box">
            <div className="av-stat-label">POTENTIAL WIN</div>
            <div className="av-stat-val" style={{ color: '#35d07f' }}>
              {betPlaced && !cashedOut ? `${Math.floor(stake * mult)} pts` : '0 pts'}
            </div>
          </div>
          <button className={`av-main-btn btn-${btnState()}`}
            onClick={handleAction} disabled={btnState() === 'waiting'}>
            {btnText()}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Aviator;
