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
  const [explodedTile, setExplodedTile] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [allMinesShown, setAllMinesShown] = useState(false);

  const calcMult = (safeCount, mc) => {
    let m = 1.0;
    for (let i = 0; i < safeCount; i++) m *= (GRID - mc - i) / (GRID - i);
    return parseFloat((1 / m * 0.97).toFixed(2));
  };

  const genMinesLocal = (count) => {
    const pos = new Set();
    while (pos.size < count) pos.add(Math.floor(Math.random() * GRID));
    return [...pos];
  };

  const startGame = async () => {
    if (stake > user.points) { alert('Not enough points!'); return; }
    setLoading(true);
    setResult(null);
    setExplodedTile(-1);
    setGameOver(false);
    setAllMinesShown(false);
    setRevealed([]);
    setMult(1.00);
    setProfit(0);

    try {
      // Deducts stake from DB immediately
      const res = await api.post('/casino/mines/start', { stake, mineCount });
      setMines(res.data.mines || genMinesLocal(mineCount));
      onPointsUpdate(res.data.newPoints); // instant UI update
    } catch (e) {
      // Fallback: generate locally
      setMines(genMinesLocal(mineCount));
      onPointsUpdate(Math.max(0, user.points - stake));
    }

    setActive(true);
    setLoading(false);
  };

  const revealTile = async (i) => {
    if (!active || revealed.includes(i) || gameOver || loading) return;

    if (mines.includes(i)) {
      // Hit a mine!
      setExplodedTile(i);
      setActive(false);
      setGameOver(true);
      setResult({ won: false, amount: stake });

      // Show all mines after delay
      setTimeout(() => {
        setAllMinesShown(true);
      }, 400);

      // Record bust — stake already deducted at start
      try {
        await api.post('/casino/mines/bust', { stake });
      } catch (e) { console.error(e); }

    } else {
      const newRev = [...revealed, i];
      setRevealed(newRev);
      const m = calcMult(newRev.length, mineCount);
      setMult(m);
      setProfit(Math.floor(stake * m) - stake);
    }
  };

  const cashOut = async () => {
    if (!active || revealed.length === 0 || loading) return;
    const win = Math.floor(stake * mult);
    setActive(false);
    setGameOver(true);
    setAllMinesShown(true);
    setResult({ won: true, amount: win, m: mult });
    setLoading(true);

    try {
      // Add winnings to DB
      const res = await api.post('/casino/mines/cashout', { stake, multiplier: mult });
      onPointsUpdate(res.data.newPoints); // instant UI update
    } catch (e) {
      console.error(e);
      // Fallback
      try {
        const res = await api.post('/casino/play', {
          game: 'mines', stake, multiplier: mult, result: 'won'
        });
        onPointsUpdate(res.data.newPoints);
      } catch (e2) { console.error(e2); }
    }
    setLoading(false);
  };

  const getTileState = (i) => {
    if (i === explodedTile) return 'exploded';
    if (revealed.includes(i)) return 'gem';
    if (allMinesShown && mines.includes(i)) return 'bomb';
    return 'hidden';
  };

  return (
    <div className="mn-game">
      {result && (
        <div className={`mn-result-bar ${result.won ? 'won' : 'lost'}`}>
          {result.won
            ? `💎 Cashed out ${result.m?.toFixed(2)}x — Won ${result.amount} pts!`
            : `💣 Hit a mine! Lost ${stake} pts`}
        </div>
      )}
      <div className="mn-layout">
        <div className="mn-grid-wrap">
          <div className="mn-grid">
            {Array.from({ length: GRID }, (_, i) => {
              const state = getTileState(i);
              return (
                <button key={i}
                  className={`mn-tile mn-${state}`}
                  onClick={() => revealTile(i)}
                  disabled={!active || revealed.includes(i) || gameOver || loading}>
                  {state === 'gem' && <span>💎</span>}
                  {state === 'bomb' && <span>💣</span>}
                  {state === 'exploded' && <span>💥</span>}
                  {state === 'hidden' && <span className="mn-q">?</span>}
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
            <div className={`mn-s-val ${profit >= 0 ? 'green' : 'red'}`}>
              {profit >= 0 ? '+' : ''}{profit} pts
            </div>
          </div>
          <div className="mn-stat-card">
            <div className="mn-s-lbl">SAFE LEFT</div>
            <div className="mn-s-val white">
              {active ? Math.max(0, GRID - mineCount - revealed.length) : '—'}
            </div>
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
            <button className="mn-action-btn mn-start" onClick={startGame}
              disabled={loading || user.points < stake}>
              {loading ? 'Starting...' : `💣 START (${stake} pts)`}
            </button>
          ) : (
            <button className="mn-action-btn mn-cashout" onClick={cashOut}
              disabled={revealed.length === 0 || loading}>
              {loading ? '...' : `💰 CASH OUT ${Math.floor(stake * mult)} PTS`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Mines;
