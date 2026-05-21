"use client";
export default function AiBrain() {
  const nodes = [
    // input layer
    { id: "i1", cx: 60,  cy: 80  },
    { id: "i2", cx: 60,  cy: 160 },
    { id: "i3", cx: 60,  cy: 240 },
    { id: "i4", cx: 60,  cy: 320 },
    // hidden layer 1
    { id: "h1", cx: 180, cy: 60  },
    { id: "h2", cx: 180, cy: 140 },
    { id: "h3", cx: 180, cy: 220 },
    { id: "h4", cx: 180, cy: 300 },
    { id: "h5", cx: 180, cy: 360 },
    // hidden layer 2
    { id: "h6", cx: 300, cy: 100 },
    { id: "h7", cx: 300, cy: 200 },
    { id: "h8", cx: 300, cy: 300 },
    // output layer
    { id: "o1", cx: 420, cy: 120 },
    { id: "o2", cx: 420, cy: 200 },
    { id: "o3", cx: 420, cy: 280 },
  ];

  const edges = [
    // input → h1
    ["i1","h1"],["i1","h2"],["i1","h3"],
    ["i2","h2"],["i2","h3"],["i2","h4"],
    ["i3","h2"],["i3","h3"],["i3","h4"],["i3","h5"],
    ["i4","h3"],["i4","h4"],["i4","h5"],
    // h1 → h2
    ["h1","h6"],["h1","h7"],
    ["h2","h6"],["h2","h7"],["h2","h8"],
    ["h3","h6"],["h3","h7"],["h3","h8"],
    ["h4","h7"],["h4","h8"],
    ["h5","h7"],["h5","h8"],
    // h2 → output
    ["h6","o1"],["h6","o2"],
    ["h7","o1"],["h7","o2"],["h7","o3"],
    ["h8","o2"],["h8","o3"],
  ];

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  // animated packets — a subset of edges get traveling dots
  const packetEdges = ["i2","h3","h7","o2"].reduce<string[]>((acc, _, i, arr) => {
    if (i < arr.length - 1) acc.push(`${arr[i]}→${arr[i+1]}`);
    return acc;
  }, []);

  return (
    <svg
      viewBox="0 0 480 420"
      className="w-full max-w-lg opacity-90"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id="nodeGrad" cx="50%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#6366f1" />
        </radialGradient>
        <radialGradient id="outputGrad" cx="50%" cy="30%" r="70%">
          <stop offset="0%"   stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </radialGradient>
        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Background grid */}
      {Array.from({ length: 10 }).map((_, i) => (
        <line key={`v${i}`} x1={i * 53} y1="0" x2={i * 53} y2="420"
          stroke="#1e293b" strokeWidth="1" />
      ))}
      {Array.from({ length: 9 }).map((_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 52} x2="480" y2={i * 52}
          stroke="#1e293b" strokeWidth="1" />
      ))}

      {/* Edges */}
      {edges.map(([a, b], i) => {
        const na = nodeMap[a], nb = nodeMap[b];
        if (!na || !nb) return null;
        return (
          <line
            key={i}
            x1={na.cx} y1={na.cy} x2={nb.cx} y2={nb.cy}
            stroke="url(#edgeGrad)" strokeWidth="1"
          />
        );
      })}

      {/* Animated packet on main path */}
      {[
        { from: "i2", to: "h3", delay: "0s" },
        { from: "h3", to: "h7", delay: "0.8s" },
        { from: "h7", to: "o2", delay: "1.6s" },
      ].map(({ from, to, delay }) => {
        const a = nodeMap[from], b = nodeMap[to];
        if (!a || !b) return null;
        const len = Math.hypot(b.cx - a.cx, b.cy - a.cy);
        return (
          <line
            key={`${from}${to}`}
            x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
            stroke="#a855f7" strokeWidth="2"
            strokeDasharray={`${len} ${len}`}
            strokeDashoffset={len}
            style={{ animationDelay: delay }}
            className="packet"
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((n, i) => {
        const isOutput = n.id.startsWith("o");
        const isInput  = n.id.startsWith("i");
        return (
          <circle
            key={n.id}
            cx={n.cx} cy={n.cy} r="7"
            fill={isOutput ? "url(#outputGrad)" : "url(#nodeGrad)"}
            filter="url(#nodeGlow)"
            className="node"
            style={{ animationDelay: `${(i * 0.3) % 2}s` }}
          />
        );
      })}

      {/* Layer labels */}
      {[
        { x: 60,  label: "Resume" },
        { x: 180, label: "Skills" },
        { x: 300, label: "Match" },
        { x: 420, label: "Apply" },
      ].map(({ x, label }) => (
        <text key={label} x={x} y="400" textAnchor="middle"
          fontSize="11" fill="#6366f1" fontFamily="Arial" letterSpacing="1" opacity="0.8">
          {label}
        </text>
      ))}

      {/* Score badge on output */}
      <rect x="435" y="185" width="42" height="22" rx="6"
        fill="#059669" opacity="0.9" />
      <text x="456" y="200" textAnchor="middle"
        fontSize="11" fontWeight="bold" fill="white" fontFamily="Arial">
        87%
      </text>
    </svg>
  );
}
