import React, { useState } from 'react';
import api from '../../utils/api';
import './TeenPatti.css';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED = ['♥', '♦'];
const RV = { A:14,K:13,Q:12,J:11,'10':10,'9':9,'8':8,'7':7,'6':6,'5':5,'4':4,'3':3,'2':2 };

const rCard = (used = []) => {
  let c;
  do { c = { s: SUITS[~~(Math.random()*4)], r: RANKS[~~(Math.random()*13)] }; }
  while (used.find(u => u.s === c.s && u.r === c.r));
  return c;
};

const handRank = (cards) => {
  const vals = cards.map(c => RV[c.r]).sort((a,b) => b-a);
  const fl = cards.every(c => c.s === cards[0].s);
  const st = (vals[0]-vals[1]===1 && vals[1]-vals[2]===1) || (vals[0]===14 && vals[1]===3 && vals[2]===2);
  const tok = vals[0]===vals[1] && vals[1]===vals[2];
  const pr = vals[0]===vals[1] || vals[1]===vals[2];
  if (tok && fl) return { r:6, n:'Trail (3 of a Kind)' };
  if (st && fl)  return { r:5, n:'Pure Sequence' };
  if (tok)       return { r:5.5, n:'Three of a Kind' };
  if (st)        return { r:4, n:'Sequence' };
  if (fl)        return { r:3, n:'Colour' };
  if (pr)        return { r:2, n:'Pair' };
  return { r:1, n:'High Card' };
};

const Card = ({ card, faceDown, delay=0 }) => {
  const red = card && RED.includes(card.s);
  return (
    <div className={`tp-card ${faceDown ? 'face-down' : red ? 'face-red' : 'face-black'}`}
      style={{ animationDelay:`${delay}s` }}>
      {!faceDown && card && (
        <>
          <div className="tp-rank-top">{card.r}<br/>{card.s}</div>
          <div className="tp-suit-mid">{card.s}</div>
          <div className="tp-rank-bot">{card.r}</div>
        </>
      )}
    </div>
  );
};

const TeenPatti = ({ user, onPointsUpdate }) => {
  const [stake, setStake] = useState(50);
  const [state, setState] = useState('idle');
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
  const [showDealer, setShowDealer] = useState(false);
  const [result, setResult] = useState(null);
  const [playerHand, setPlayerHand] = useState('');
  const [dealerHand, setDealerHand] = useState('');
  const [loading, setLoading] = useState(false);

  const deal = async () => {
    if (stake > user.points) { alert('Not enough points!'); return; }
    setState('dealing');
    setShowDealer(false);
    setResult(null);
    const used = [];
    const pc = [rCard(used), rCard(used), rCard(used)];
    used.push(...pc);
    const dc = [rCard(used), rCard(used), rCard(used)];
    setPlayerCards(pc);
    setDealerCards(dc);
    setPlayerHand(handRank(pc).n);
    setDealerHand('');
    setTimeout(() => setState('playing'), 600);
  };

  const showdown = async () => {
    setShowDealer(true);
    const ph = handRank(playerCards);
    const dh = handRank(dealerCards);
    setDealerHand(dh.n);

    let won = ph.r > dh.r;
    if (ph.r === dh.r) {
      const pv = playerCards.map(c => RV[c.r]).sort((a,b) => b-a);
      const dv = dealerCards.map(c => RV[c.r]).sort((a,b) => b-a);
      won = pv[0] > dv[0];
    }

    const win = Math.floor(stake * 1.9);
    setResult({ won, amount: won ? win : stake });
    setState('result');
    setLoading(true);

    try {
      const res = await api.post('/casino/play', {
        game: 'teen_patti',
        stake,
        multiplier: won ? 1.9 : 0,
        result: won ? 'won' : 'lost'
      });
      onPointsUpdate(res.data.newPoints); // instant update
    } catch (e) { console.error('TeenPatti save error:', e); }

    setLoading(false);
  };

  const fold = async () => {
    const lose = Math.floor(stake / 2);
    setShowDealer(true);
    setDealerHand(handRank(dealerCards).n);
    setResult({ won: false, amount: lose, folded: true });
    setState('result');
    setLoading(true);

    try {
      const res = await api.post('/casino/play', {
        game: 'teen_patti',
        stake: lose,
        multiplier: 0,
        result: 'lost'
      });
      onPointsUpdate(res.data.newPoints);
    } catch (e) { console.error('TeenPatti fold save error:', e); }

    setLoading(false);
  };

  const reset = () => {
    setState('idle'); setResult(null);
    setPlayerCards([]); setDealerCards([]);
    setShowDealer(false); setPlayerHand(''); setDealerHand('');
  };

  return (
    <div className="tp-game">
      <div className="tp-table">
        <div className="tp-area">
          <div className="tp-area-lbl">🤖 Dealer</div>
          <div className="tp-cards-row">
            {dealerCards.length > 0
              ? dealerCards.map((c,i) => <Card key={i} card={c} faceDown={!showDealer} delay={i*0.1} />)
              : [0,1,2].map(i => <div key={i} className="tp-card placeholder" />)}
          </div>
          {showDealer && dealerHand && <div className="tp-hand-badge">{dealerHand}</div>}
        </div>

        <div className="tp-center-area">
          {state === 'idle' && <div className="tp-idle-icon">🃏</div>}
          {state === 'playing' && <div className="tp-pot">Pot: {stake} pts</div>}
          {result && (
            <div className={`tp-result-box ${result.won ? 'won' : 'lost'}`}>
              <div className="tp-res-title">
                {result.folded ? '🏳️ Folded' : result.won ? '🏆 YOU WIN!' : '😔 DEALER WINS'}
              </div>
              <div className="tp-res-amt">
                {result.won ? `+${result.amount} pts` : `-${result.amount} pts`}
              </div>
            </div>
          )}
        </div>

        <div className="tp-area">
          <div className="tp-cards-row">
            {playerCards.length > 0
              ? playerCards.map((c,i) => <Card key={i} card={c} faceDown={false} delay={i*0.1+0.25} />)
              : [0,1,2].map(i => <div key={i} className="tp-card placeholder" />)}
          </div>
          {playerHand && <div className="tp-hand-badge player">{playerHand}</div>}
          <div className="tp-area-lbl" style={{marginTop:6}}>👤 You</div>
        </div>
      </div>

      <div className="tp-controls">
        <div className="tp-stake-row">
          <div>
            <div className="tp-lbl">STAKE</div>
            <input className="tp-input" type="number" value={stake}
              onChange={e => setStake(Math.max(1, parseInt(e.target.value)||1))}
              disabled={state==='playing'||state==='dealing'} />
          </div>
          <div className="tp-qbtns">
            {[10,50,100,500].map(s => (
              <button key={s} className={`tp-qbtn ${stake===s?'active':''}`}
                onClick={()=>setStake(s)}
                disabled={state==='playing'||state==='dealing'}>{s}</button>
            ))}
          </div>
        </div>
        <div className="tp-actions">
          {(state==='idle'||state==='result') && (
            <button className="tp-btn tp-deal" onClick={state==='result'?reset:deal} disabled={loading}>
              🃏 {state==='result'?'PLAY AGAIN':`DEAL CARDS (${stake} pts)`}
            </button>
          )}
          {state==='dealing' && <button className="tp-btn tp-deal" disabled>Dealing...</button>}
          {state==='playing' && (
            <>
              <button className="tp-btn tp-call" onClick={showdown} disabled={loading}>✅ SHOW / CALL</button>
              <button className="tp-btn tp-fold" onClick={fold} disabled={loading}>
                🏳️ FOLD (lose {Math.floor(stake/2)} pts)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeenPatti;
