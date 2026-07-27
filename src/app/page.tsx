import { DEFAULT_RANKING, TIMEFRAMES } from "../lib/contracts";

const instruments = ["QQQ", "^IXIC", "BTC-USD", "GC=F"];
const strategies = [
  ["01", "SMA 50/200", "+18.4%"],
  ["02", "Donchian 20", "+15.1%"],
  ["03", "RSI(2) Revert", "+12.8%"],
  ["04", "12M Momentum", "+11.9%"],
  ["05", "Bollinger MR", "+9.7%"],
];

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-title"><span>[ {title} ]</span><span className="muted">● LIVE</span></header>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <main>
      <header className="topbar">
        <div><span className="prompt">❯</span> <h1>STRATEGY LAB</h1> <span className="version">v0.1</span></div>
        <div className="status"><span>DATA: HISTORICAL</span><span className="online">● ONLINE</span><span>EDUCATIONAL MODE</span></div>
      </header>

      <nav className="commandbar" aria-label="Backtest configuration">
        <label>SYMBOL <select defaultValue="QQQ">{instruments.map((x) => <option key={x}>{x}</option>)}</select></label>
        <div className="timeframes">{TIMEFRAMES.map((x) => <button className={x === "1D" ? "active" : ""} key={x}>{x}</button>)}</div>
        <label>CAPITAL <input defaultValue="$10,000" /></label>
        <button className="run">▶ RUN BACKTEST</button>
      </nav>

      <div className="dashboard-grid">
        <Panel title="STRATEGIES" className="catalog">
          <div className="search">/ search strategies...</div>
          <div className="strategy-list">{strategies.map(([n, name, pnl], i) => (
            <button className={i === 0 ? "strategy selected" : "strategy"} key={n}>
              <span className="rank">{n}</span><span>{name}</span><span className="positive">{pnl}</span>
            </button>
          ))}</div>
          <button className="new-strategy">+ NEW STRATEGY</button>
        </Panel>

        <Panel title="MARKET PLAYBACK" className="market">
          <div className="market-head"><b>QQQ · 1D</b><span>2024-01-01 → 2025-12-31</span></div>
          <div className="chart" aria-label="Illustrative equity chart">
            <div className="gridlines" />
            <svg viewBox="0 0 800 250" role="img" aria-label="Strategy equity curve">
              <polyline className="benchmark-line" points="0,210 65,188 130,192 195,155 260,170 325,125 390,140 455,95 520,110 585,62 650,74 715,38 800,25" />
              <polyline className="equity-line" points="0,220 55,205 105,180 155,195 205,145 255,160 305,112 355,130 405,90 455,105 505,58 555,76 605,43 655,62 705,30 755,48 800,14" />
            </svg>
            <span className="buy b1">▲ BUY</span><span className="sell s1">▼ SELL</span><span className="buy b2">▲ BUY</span>
          </div>
          <div className="playback"><button>◀</button><button>▶ PLAY</button><button>▶</button><input aria-label="Playback position" type="range" defaultValue="68" /><span>2×</span></div>
        </Panel>

        <Panel title="PERFORMANCE" className="performance">
          <div className="metrics">
            <div><span>NET P&amp;L</span><b className="positive">+$1,842</b></div>
            <div><span>RETURN</span><b className="positive">+18.42%</b></div>
            <div><span>SHARPE</span><b>1.37</b></div>
            <div><span>MAX DD</span><b className="negative">-8.21%</b></div>
            <div><span>WIN RATE</span><b>57.8%</b></div>
            <div><span>TRADES</span><b>38</b></div>
          </div>
        </Panel>

        <Panel title="LEADERBOARD" className="leaderboard">
          <div className="ranking-config">RANK BY {DEFAULT_RANKING.map((x) => <label key={x.metric}><input type="checkbox" defaultChecked={x.enabled} /> {x.metric === "netPnl" ? "P&L" : x.metric}</label>)}</div>
          <table><thead><tr><th>#</th><th>STRATEGY</th><th>P&amp;L</th><th>SHARPE</th><th>SCORE</th></tr></thead>
            <tbody>{strategies.slice(0, 4).map(([n, name, pnl], i) => <tr key={n}><td>{n}</td><td>{name}</td><td className="positive">{pnl}</td><td>{(1.37 - i * .12).toFixed(2)}</td><td>{(94 - i * 5)}.0</td></tr>)}</tbody></table>
        </Panel>

        <Panel title="TRADE LOG" className="trades">
          <div className="log-line"><span>2025-07-14</span><b className="positive">LONG</b><span>@ 521.84</span><span className="positive">+$184.22</span></div>
          <div className="log-line"><span>2025-06-03</span><b className="negative">SHORT</b><span>@ 515.09</span><span className="positive">+$92.16</span></div>
          <div className="log-line"><span>2025-04-22</span><b className="positive">LONG</b><span>@ 498.72</span><span className="negative">-$41.08</span></div>
        </Panel>

        <Panel title="HERMES TERMINAL" className="terminal-panel">
          <div className="terminal-history"><p><span className="prompt">hermes@lab:~$</span> Describe a strategy to create...</p><p className="muted">Strategy code will be generated in this terminal, validated, then shown for your approval before execution.</p></div>
          <div className="terminal-input"><span className="prompt">❯</span><input aria-label="Strategy request" placeholder="e.g. Buy when RSI crosses below 25..." /><button>SEND ↵</button></div>
        </Panel>
      </div>
      <footer>Historical simulation • Next-bar execution • 0.10% commission • 0.05% slippage <span>Not financial advice</span></footer>
    </main>
  );
}
