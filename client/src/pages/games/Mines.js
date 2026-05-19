import React, { useState } from 'react';
import api from '../../utils/api';
import './Mines.css';

const GRID = 25;

const Mines = ({ user, onPointsUpdate }) => {
  const [stake, setStake] = useState(50);
  const [mineCount, setMineCount] = useState(5);
  const [active, setActive] = useState(false);
  const [mines, setMines] = useState([]);
  const [revealed, setRevealed] = useState([]);
  const [mult, setMult] = useState(1.00);
  const [profit, setProfit] = useState(0);
  const [result, setResult] = useState(null);
  const [exploded, setExploded] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [allRevealed, setAllRevealed] = useState(false);

  const calcMult = (safe, mc) => {
    let m = 1.0;
    for (let i = 0; i < safe; i++) m *= (GRID - mc - i) / (GRID - i);
    return parseFloat((1 / m * 0.97).toFixed(2));
  };

  const genMines = (count) => {
    const pos = new Set();
    while (pos.size < count) pos.add(Math.floor(Math.random() * GRID));
    return [...pos];
  };

  const startGame = async () => {
    if (stake > user.points) { alert('Not enough points!'); return; }
    setLoading(true);
    let minePos;
    try {
      // This route now EXISTS and deducts stake from DB immediately
      const res = await api.post('/casino/mines/start', { stake, mineCount });
      minePos = res.data.mines || genMines(mineCount);
      onPointsUpdate(res.data.newPoints); // points go down immediately
    } catch (e) {
      // Fallback: generate locally if API fails, but don't deduct (error state)
      console.error('Mines start error:', e);
      minePos = genMines(mineCount);
    }
    setMines(minePos);
    setRevealed([]);
    setMult(1.00);
    setProfit(0);
    setActive(true);
    setResult(null);
    setExploded(-1);
    setAllRevealed(false);
    setLoading(false);
  };

  const revealTile = async (i) => {
    if (!active || revealed.includes(i) || allRevealed) return;
    if (mines.includes(i)) {
      setExploded(i);
      setActive(false);
      setAllRevealed(true);
      setResult({ won: false, amount: stake });
      // Stake already deducted at start, no need to call /play for loss
      // Just update display — points already correct in DB
    } else {
      const newRev = [...revealed, i];
      setRevealed(newRev);
      const m = calcMult(newRev.length, mineCount);
      setMult(m);
      setProfit(Math.floor(stake * m) - stake);
    }
  };

  const cashOut = async () => {
    if (!active || revealed.length === 0) return;
    const win = Math.floor(stake * mult);
    setActive(false);
    setAllRevealed(true);
    setResult({ won: true, amount: win, m: mult });
    setLoading(true);
    try {
      // Use dedicated cashout route — adds winnings (stake already deducted at start)
      const res = await api.post('/casino/mines/cashout', { stake, multiplier: mult });
      onPointsUpdate(res.data.newPoints);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const getTile = (i) => {
    if (!allRevealed && !revealed.includes(i)) return 'hidden';
    if (revealed.includes(i)) return 'gem';
    if (i === exploded) return 'exploded';
    if (mines.includes(i)) return 'bomb';
    return 'safe-end';
  };

  return (
    <div className="mn-game">
      {result && (
        <div className={`mn-result-bar ${result.won ? 'won' : 'lost'}`}>
          {result.won ? `💎 Cashed out ${result.m.toFixed(2)}x — Won ${result.amount} pts!` : `💣 Hit a mine! Lost ${result.amount} pts`}
        </div>
      )}
      <div className="mn-layout">
        <div className="mn-grid-wrap">
          <div className="mn-grid">
            {Array.from({ length: GRID }, (_, i) => {
              const state = getTile(i);
              return (
                <button key={i} className={`mn-tile mn-${state}`}
                  onClick={() => revealTile(i)}
                  disabled={!active || revealed.includes(i) || allRevealed}>
                  {state === 'gem' && <span>💎</span>}
                  {(state === 'bomb' || state === 'exploded') && <span>{state === 'exploded' ? '💥' : '💣'}</span>}
                  {state === 'hidden' && <span className="mn-q">?</span>}
                  {state === 'safe-end' && <span>💎</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mn-panel">
          <div className="mn-stat-card">
            <div className="mn-s-lbl">MULTIPLIER</div>
            <div className="mn-s-val blue">{mult.toFixed(2)}x</div>
          </div>
          <div className="mn-stat-card">
            <div className="mn-s-lbl">PROFIT</div>
            <div className={`mn-s-val ${profit >= 0 ? 'green' : 'red'}`}>{profit >= 0 ? '+' : ''}{profit} pts</div>
          </div>
          <div className="mn-stat-card">
            <div className="mn-s-lbl">SAFE LEFT</div>
            <div className="mn-s-val white">{active ? Math.max(0, GRID - mineCount - revealed.length) : '—'}</div>
          </div>
          <div>
            <div className="mn-ctrl-lbl">STAKE</div>
            <input className="mn-input" type="number" value={stake}
              onChange={e => setStake(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={active} />
            <div className="mn-qbtns">
              {[10, 50, 100, 500].map(s => (
                <button key={s} className={`mn-qbtn ${stake === s ? 'active' : ''}`}
                  onClick={() => setStake(s)} disabled={active}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mn-ctrl-lbl">MINES COUNT</div>
            <div className="mn-count-row">
              {[1, 3, 5, 10, 15].map(m => (
                <button key={m} className={`mn-cbtn ${mineCount === m ? 'active' : ''}`}
                  onClick={() => setMineCount(m)} disabled={active}>{m}</button>
              ))}
            </div>
          </div>
          {!active ? (
            <button className="mn-action-btn mn-start" onClick={startGame} disabled={loading}>
              {loading ? '...' : `💣 START (${stake} pts)`}
            </button>
          ) : (
            <button className="mn-action-btn mn-cashout" onClick={cashOut} disabled={revealed.length === 0 || loading}>
              {loading ? '...' : `💰 CASH OUT ${Math.floor(stake * mult)} PTS`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Mines;
