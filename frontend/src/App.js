import React, { useState, useRef, useEffect, useCallback } from 'react';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// ── colour tokens ─────────────────────────────────────────────
const C = {
  bg: '#0a0e0f',
  surface: '#0f1518',
  border: '#1e2d30',
  borderBright: '#2a4a50',
  cyan: '#00d4d4',
  cyanDim: '#006e6e',
  green: '#00ff88',
  greenDim: '#005533',
  red: '#ff4466',
  yellow: '#ffd060',
  blue: '#4488ff',
  text: '#c8d8da',
  textDim: '#5a7a7e',
  textBright: '#e8f4f5',
  white: '#ffffff',
};

// ── tiny helpers ──────────────────────────────────────────────
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const syne = { fontFamily: "'Syne', sans-serif" };

function Pill({ color, children }) {
  return (
    <span style={{
      ...mono, fontSize: 11, fontWeight: 700,
      padding: '2px 8px', borderRadius: 4,
      background: color + '22', color, border: `1px solid ${color}55`,
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>{children}</span>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} style={{
      ...mono, fontSize: 11, padding: '4px 12px',
      background: copied ? C.greenDim : '#1a2830',
      color: copied ? C.green : C.cyan,
      border: `1px solid ${copied ? C.green : C.cyanDim}`,
      borderRadius: 4, cursor: 'pointer', transition: 'all .2s',
    }}>{copied ? '✓ copied' : 'copy'}</button>
  );
}

function DockerfileViewer({ content, title = 'Dockerfile', badge }) {
  const lines = content.split('\n');
  return (
    <div style={{
      background: '#070c0e', border: `1px solid ${C.border}`,
      borderRadius: 8, overflow: 'hidden', marginTop: 12,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: '#0d1618', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ ...mono, fontSize: 12, color: C.textDim }}>📄</span>
          <span style={{ ...mono, fontSize: 12, color: C.text }}>{title}</span>
          {badge && <Pill color={C.cyan}>{badge}</Pill>}
        </div>
        <CopyBtn text={content} />
      </div>
      <div style={{ padding: '12px 0', maxHeight: 420, overflowY: 'auto' }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', padding: '1px 0' }}>
            <span style={{
              ...mono, fontSize: 12, color: C.textDim, minWidth: 44,
              textAlign: 'right', paddingRight: 16, userSelect: 'none',
            }}>{i + 1}</span>
            <span style={{
              ...mono, fontSize: 12,
              color: line.startsWith('FROM') ? C.yellow
                : line.startsWith('RUN') ? C.green
                : line.startsWith('COPY') || line.startsWith('ADD') ? C.blue
                : line.startsWith('CMD') || line.startsWith('ENTRYPOINT') ? C.cyan
                : line.startsWith('#') ? C.textDim
                : line.startsWith('ENV') || line.startsWith('ARG') ? '#ff88aa'
                : line.startsWith('EXPOSE') ? C.yellow
                : line.startsWith('WORKDIR') ? '#aa88ff'
                : line.startsWith('LABEL') ? C.textDim
                : C.text,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LogPanel({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div ref={ref} style={{
      background: '#050a0b', border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 16, maxHeight: 280, overflowY: 'auto',
      marginTop: 12,
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{
          ...mono, fontSize: 11.5, lineHeight: 1.7,
          color: l.startsWith('ERROR') || l.includes('error') || l.includes('failed')
            ? C.red
            : l.startsWith('Step') || l.includes('Successfully')
            ? C.green
            : l.startsWith('--->')
            ? C.cyan
            : C.textDim,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>{l}</div>
      ))}
      {lines.length === 0 && (
        <span style={{ ...mono, fontSize: 11, color: C.textDim }}>Waiting for build output...</span>
      )}
    </div>
  );
}

function StepIndicator({ steps, current }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? C.green : active ? C.cyan : '#1a2830',
              border: `2px solid ${done ? C.green : active ? C.cyan : C.border}`,
              transition: 'all .3s',
              boxShadow: active ? `0 0 12px ${C.cyan}66` : done ? `0 0 8px ${C.green}44` : 'none',
            }}>
              <span style={{ ...mono, fontSize: 10, fontWeight: 700, color: done || active ? '#000' : C.textDim }}>
                {done ? '✓' : i + 1}
              </span>
            </div>
            <div style={{
              flex: 1, height: 2,
              background: done ? C.green : i < current ? C.border : C.border,
              transition: 'background .3s',
              display: i === steps.length - 1 ? 'none' : 'block',
            }} />
          </div>
        );
      })}
    </div>
  );
}

function ScanBadges({ languages, fileCount, keyFiles }) {
  return (
    <div style={{
      background: '#0d1618', border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 16, marginTop: 12,
    }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {languages.map(l => <Pill key={l} color={C.cyan}>{l}</Pill>)}
        <Pill color={C.yellow}>{fileCount} files</Pill>
      </div>
      {keyFiles.length > 0 && (
        <div>
          <div style={{ ...mono, fontSize: 11, color: C.textDim, marginBottom: 6 }}>key files detected:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {keyFiles.map(f => (
              <span key={f} style={{ ...mono, fontSize: 11, color: C.blue, background: '#0a1c2e', padding: '2px 8px', borderRadius: 4 }}>{f}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [statusMsg, setStatusMsg] = useState('');
  const [currentStep, setCurrentStep] = useState(-1);
  const [scanData, setScanData] = useState(null);
  const [generatedDockerfile, setGeneratedDockerfile] = useState('');
  const [currentDockerfile, setCurrentDockerfile] = useState('');
  const [buildLogs, setBuildLogs] = useState([]);
  const [buildAttempts, setBuildAttempts] = useState([]);
  const [runResult, setRunResult] = useState(null);
  const [finalDockerfile, setFinalDockerfile] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const steps = ['Clone', 'Scan', 'Generate', 'Build', 'Verify', 'Done'];

  const resetState = () => {
    setPhase('running');
    setStatusMsg('');
    setCurrentStep(0);
    setScanData(null);
    setGeneratedDockerfile('');
    setCurrentDockerfile('');
    setBuildLogs([]);
    setBuildAttempts([]);
    setRunResult(null);
    setFinalDockerfile('');
    setComposeContent('');
    setSuccess(false);
    setErrorMsg('');
  };

  const handleForge = useCallback(async () => {
    if (!url.trim()) return;
    resetState();

    const resp = await fetch(`${API_BASE}/forge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ github_url: url.trim() }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      setPhase('error');
      setErrorMsg(err.detail || 'Request failed');
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const evt = JSON.parse(line.slice(5).trim());
          handleEvent(evt);
        } catch (_) { /* ignore parse errors */ }
      }
    }
  }, [url]);

  const handleEvent = useCallback((evt) => {
    switch (evt.type) {
      case 'status':
        setStatusMsg(evt.message);
        if (evt.message.includes('Cloning')) setCurrentStep(0);
        else if (evt.message.includes('Scanning')) setCurrentStep(1);
        else if (evt.message.includes('Analyzing') || evt.message.includes('Gemini')) setCurrentStep(2);
        else if (evt.message.includes('Building')) setCurrentStep(3);
        else if (evt.message.includes('Verifying')) setCurrentStep(4);
        else if (evt.message.includes('succeeded') || evt.message.includes('Verif')) setCurrentStep(4);
        break;
      case 'scan':
        setScanData({ languages: evt.languages, fileCount: evt.file_count, keyFiles: evt.key_files });
        break;
      case 'dockerfile_generated':
        setGeneratedDockerfile(evt.dockerfile);
        setCurrentDockerfile(evt.dockerfile);
        if (evt.compose) setComposeContent(evt.compose);
        break;
      case 'build_output':
        setBuildLogs(prev => [...prev, ...evt.output.split('\n').filter(Boolean)]);
        setBuildAttempts(prev => [...prev, { attempt: evt.attempt, success: evt.success, output: evt.output }]);
        break;
      case 'dockerfile_fixed':
        setCurrentDockerfile(evt.dockerfile);
        break;
      case 'run_result':
        setRunResult({ success: evt.success, message: evt.message });
        setCurrentStep(5);
        break;
      case 'complete':
        setFinalDockerfile(evt.final_dockerfile);
        setSuccess(evt.success);
        if (evt.compose) setComposeContent(evt.compose);
        setPhase('done');
        setCurrentStep(5);
        break;
      case 'error':
        setErrorMsg(evt.message);
        setPhase('error');
        break;
      default: break;
    }
  }, []);

  // ── render ────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {/* Scanlines overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.05) 2px, rgba(0,0,0,0.05) 4px)',
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, margin: '0 auto', padding: '0 20px 60px' }}>

        {/* ── Header ── */}
        <div style={{ padding: '40px 0 32px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
            <h1 style={{
              ...syne, margin: 0, fontSize: 36, fontWeight: 800,
              color: C.white, letterSpacing: '-0.02em',
            }}>Docker<span style={{ color: C.cyan }}>Forge</span></h1>
            <Pill color={C.green}>v1.0</Pill>
          </div>
          <p style={{ ...mono, margin: 0, fontSize: 13, color: C.textDim, letterSpacing: '0.03em' }}>
            AI-powered Dockerfile generator · Clone → Scan → Generate → Build → Verify
          </p>
        </div>

        {/* ── Input ── */}
        <div style={{ paddingTop: 32, paddingBottom: 28 }}>
          <label style={{ ...mono, fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            GitHub Repository URL
          </label>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: C.cyanDim, fontSize: 14,
              }}>$</span>
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && phase !== 'running' && handleForge()}
                placeholder="https://github.com/owner/repo"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: C.surface, color: C.text,
                  border: `1px solid ${phase === 'running' ? C.cyanDim : C.border}`,
                  borderRadius: 6, padding: '12px 14px 12px 28px',
                  ...mono, fontSize: 14, outline: 'none',
                  transition: 'border-color .2s',
                }}
                disabled={phase === 'running'}
              />
            </div>
            <button
              onClick={handleForge}
              disabled={phase === 'running' || !url.trim()}
              style={{
                ...syne, fontWeight: 700, fontSize: 14,
                padding: '12px 28px', borderRadius: 6,
                background: phase === 'running' ? C.cyanDim : C.cyan,
                color: '#000', border: 'none', cursor: phase === 'running' ? 'not-allowed' : 'pointer',
                opacity: !url.trim() ? 0.5 : 1,
                transition: 'all .2s',
                boxShadow: phase === 'running' ? 'none' : `0 0 20px ${C.cyan}44`,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              {phase === 'running' ? '⚙ Forging...' : '⚡ Forge'}
            </button>
          </div>

          {/* Example repos */}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ ...mono, fontSize: 11, color: C.textDim }}>Try:</span>
            {[
              'https://github.com/tiangolo/fastapi',
              'https://github.com/expressjs/express',
              'https://github.com/pallets/flask',
            ].map(ex => (
              <button key={ex} onClick={() => setUrl(ex)} style={{
                ...mono, fontSize: 11, background: 'none', border: 'none',
                color: C.blue, cursor: 'pointer', padding: 0, textDecoration: 'underline',
                textDecorationStyle: 'dotted',
              }}>{ex.replace('https://github.com/', '')}</button>
            ))}
          </div>
        </div>

        {/* ── Running / Done state ── */}
        {(phase === 'running' || phase === 'done') && (
          <div>
            {/* Step progress */}
            <StepIndicator steps={steps} current={currentStep} />

            {/* Status message */}
            {statusMsg && (
              <div style={{
                ...mono, fontSize: 13, color: C.cyan,
                padding: '10px 16px', background: '#0a1820',
                border: `1px solid ${C.cyanDim}`, borderRadius: 6, marginBottom: 16,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                {phase === 'running' && (
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⚙</span>
                )}
                {statusMsg}
              </div>
            )}

            {/* Scan results */}
            {scanData && <ScanBadges {...scanData} />}

            {/* Generated Dockerfile preview */}
            {generatedDockerfile && (
              <div style={{ marginTop: 20 }}>
                <div style={{ ...mono, fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  AI-Generated Dockerfile
                </div>
                <DockerfileViewer content={currentDockerfile || generatedDockerfile} badge="generated" />
              </div>
            )}

            {/* Build logs */}
            {buildLogs.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{
                  ...mono, fontSize: 11, color: C.textDim,
                  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  Build Output
                  {buildAttempts.length > 0 && (
                    <span style={{ display: 'flex', gap: 4 }}>
                      {buildAttempts.map(a => (
                        <Pill key={a.attempt} color={a.success ? C.green : C.red}>
                          attempt {a.attempt}: {a.success ? 'OK' : 'FAIL'}
                        </Pill>
                      ))}
                    </span>
                  )}
                </div>
                <LogPanel lines={buildLogs} />
              </div>
            )}

            {/* Run result */}
            {runResult && (
              <div style={{
                marginTop: 16, padding: '12px 16px',
                background: runResult.success ? C.greenDim + '44' : '#2a0a0a',
                border: `1px solid ${runResult.success ? C.green : C.red}`,
                borderRadius: 8,
              }}>
                <span style={{ ...mono, fontSize: 13, color: runResult.success ? C.green : C.red }}>
                  {runResult.success ? '🟢' : '🔴'} {runResult.message}
                </span>
              </div>
            )}

            {/* Final result */}
            {phase === 'done' && finalDockerfile && (
              <div style={{ marginTop: 28 }}>
                <div style={{
                  padding: '16px 20px', marginBottom: 16,
                  background: success ? '#001a0d' : '#1a0008',
                  border: `2px solid ${success ? C.green : C.red}`,
                  borderRadius: 10,
                  boxShadow: success ? `0 0 30px ${C.green}22` : `0 0 30px ${C.red}22`,
                }}>
                  <div style={{ ...syne, fontSize: 18, fontWeight: 700, color: success ? C.green : C.red, marginBottom: 4 }}>
                    {success ? '✅ Forge Complete!' : '⚠ Forge Finished (with issues)'}
                  </div>
                  <div style={{ ...mono, fontSize: 12, color: C.textDim }}>
                    {success
                      ? 'Docker image built and container verified successfully.'
                      : 'Build did not fully succeed. Review the Dockerfile and logs above.'}
                  </div>
                </div>

                <div style={{ ...mono, fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
                  Final Working Dockerfile
                </div>
                <DockerfileViewer content={finalDockerfile} badge="final" />

                {composeContent && (
                  <>
                    <div style={{ ...mono, fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 20, marginBottom: 4 }}>
                      docker-compose.yml (optional)
                    </div>
                    <DockerfileViewer content={composeContent} title="docker-compose.yml" badge="generated" />
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Error state ── */}
        {phase === 'error' && (
          <div style={{
            padding: '20px', background: '#1a0008',
            border: `1px solid ${C.red}`, borderRadius: 8, marginTop: 20,
          }}>
            <div style={{ ...syne, fontSize: 16, fontWeight: 700, color: C.red, marginBottom: 8 }}>Error</div>
            <div style={{ ...mono, fontSize: 13, color: C.text }}>{errorMsg}</div>
          </div>
        )}

        {/* ── Idle hero ── */}
        {phase === 'idle' && (
          <div style={{ marginTop: 40, paddingTop: 40, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {[
                { icon: '🔬', title: 'Deep Analysis', desc: 'Scans your entire repo — package files, entry points, languages.' },
                { icon: '🧠', title: 'Gemini AI', desc: 'Uses Gemini 2.0 Flash to reason about the right base image and steps.' },
                { icon: '🔄', title: 'Auto-Retry', desc: 'Builds the image and fixes errors automatically — up to 3 attempts.' },
              ].map(card => (
                <div key={card.title} style={{
                  padding: 20, background: C.surface,
                  border: `1px solid ${C.border}`, borderRadius: 10,
                }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{card.icon}</div>
                  <div style={{ ...syne, fontSize: 14, fontWeight: 600, color: C.textBright, marginBottom: 6 }}>{card.title}</div>
                  <div style={{ ...mono, fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>{card.desc}</div>
                </div>
              ))}
            </div>

            {/* Architecture diagram */}
            <div style={{
              marginTop: 28, padding: 24, background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: 10,
            }}>
              <div style={{ ...mono, fontSize: 11, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>
                Agent Flow
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
                {[
                  { label: 'GitHub URL', color: C.blue },
                  { label: 'Clone Repo', color: C.cyan },
                  { label: 'Scan Files', color: C.cyan },
                  { label: 'Gemini AI', color: C.yellow },
                  { label: 'docker build', color: C.green },
                  { label: 'docker run', color: C.green },
                  { label: '✓ Done', color: C.green },
                ].map((node, i, arr) => (
                  <React.Fragment key={node.label}>
                    <div style={{
                      flexShrink: 0, padding: '8px 14px',
                      background: node.color + '18', border: `1px solid ${node.color}55`,
                      borderRadius: 6,
                    }}>
                      <span style={{ ...mono, fontSize: 11, color: node.color, whiteSpace: 'nowrap' }}>{node.label}</span>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{ flexShrink: 0, width: 20, height: 1, background: C.border, position: 'relative' }}>
                        <span style={{ position: 'absolute', right: -2, top: -5, color: C.border, fontSize: 12 }}>›</span>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
              <div style={{ marginTop: 12, ...mono, fontSize: 11, color: C.textDim }}>
                ↩ On build failure: error → Gemini fix → retry (max 3 attempts)
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input::placeholder { color: #2a4a50; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #070c0e; }
        ::-webkit-scrollbar-thumb { background: #1e2d30; border-radius: 3px; }
      `}</style>
    </div>
  );
}
