import { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import apiFetch from '../api';

const LEVEL_NUM = { L100: 100, L200: 200, L300: 300, L400: 400 };
const LEVEL_LABELS = { 100: 'L100', 200: 'L200', 300: 'L300', 400: 'L400' };

const METHODS = {
  average: {
    label: 'Team average vs target',
    short: 'Avg',
    desc: 'A skill is "met" when the team\'s average proficiency reaches the target. Only members who have logged the skill are included in the average.',
  },
  averageAll: {
    label: 'Team average (include unlogged)',
    short: 'Avg+',
    desc: 'Same as average, but members with no entry are counted as L0. This is stricter — a skill with 2 experts and 12 unknowns will show a big gap.',
  },
  coverage: {
    label: '% of team at target',
    short: 'Cov',
    desc: 'A skill is "met" when at least N% of the team has reached the target level. Adjust the threshold below. People with no entry count as not meeting target.',
  },
  best: {
    label: 'Best on team vs target',
    short: 'Best',
    desc: 'A skill is "met" if at least one person on the team has reached the target. Useful for checking if anyone can cover a topic.',
  },
};

const selectStyle = { padding: '6px 12px', borderRadius: '6px', background: '#2a2a3e', color: '#fff', border: '1px solid #444', fontSize: '13px' };
const activeSelectStyle = { ...selectStyle, border: '1px solid #e67e22', background: '#3a2a1e' };

function GapAnalysis() {
  const [matrixData, setMatrixData] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterGap, setFilterGap] = useState('all');
  const [targetOverride, setTargetOverride] = useState('');
  const [method, setMethod] = useState('coverage');
  const [coverageThreshold, setCoverageThreshold] = useState(50);
  const [showInfo, setShowInfo] = useState(false);
  const [showSettings, setShowSettings] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/matrix')
      .then(r => {
        if (!r.ok) throw new Error(`Server error (${r.status})`);
        return r.json();
      })
      .then(data => { setMatrixData(data); setLoading(false); })
      .catch(err => {
        setError(err.message || 'Failed to load gap analysis');
        setLoading(false);
      });
  }, []);

  // Compute gap analysis — reacts to method, threshold, and target override
  const analysis = useMemo(() => {
    if (!matrixData) return null;

    const { users, skills, userSkills } = matrixData;
    const categories = [...new Set(skills.map(s => s.category_name).filter(Boolean))].sort();
    const teamSize = users.length;

    const skillGaps = skills.map(skill => {
      const dbTarget = LEVEL_NUM[skill.target_level] || 200;
      const target = targetOverride ? Number(targetOverride) : dbTarget;

      // All proficiencies including 0 for unlogged members
      const allProf = users.map(u => {
        const key = `${u.id}-${skill.id}`;
        const entry = userSkills[key];
        return entry ? LEVEL_NUM[entry.proficiency_level] || 0 : 0;
      });
      const loggedProf = allProf.filter(p => p > 0);
      const loggedCount = loggedProf.length;

      const avgLogged = loggedCount > 0
        ? Math.round(loggedProf.reduce((a, b) => a + b, 0) / loggedCount)
        : 0;
      const avgAll = teamSize > 0
        ? Math.round(allProf.reduce((a, b) => a + b, 0) / teamSize)
        : 0;
      const maxLevel = loggedCount > 0 ? Math.max(...loggedProf) : 0;
      const atTarget = allProf.filter(p => p >= target).length;
      const coveragePct = teamSize > 0 ? Math.round((atTarget / teamSize) * 100) : 0;

      // Determine "met" based on selected method
      let hasGap, metric, metricLabel;
      switch (method) {
        case 'average':
          metric = avgLogged;
          metricLabel = metric > 0 ? (LEVEL_LABELS[Math.round(metric / 100) * 100] || `~${metric}`) : '—';
          hasGap = avgLogged < target;
          break;
        case 'averageAll':
          metric = avgAll;
          metricLabel = metric > 0 ? (LEVEL_LABELS[Math.round(metric / 100) * 100] || `~${metric}`) : '—';
          hasGap = avgAll < target;
          break;
        case 'coverage':
          metric = coveragePct;
          metricLabel = `${coveragePct}%`;
          hasGap = coveragePct < coverageThreshold;
          break;
        case 'best':
          metric = maxLevel;
          metricLabel = maxLevel > 0 ? (LEVEL_LABELS[maxLevel] || `L${maxLevel}`) : '—';
          hasGap = maxLevel < target;
          break;
        default:
          metric = avgLogged;
          metricLabel = '—';
          hasGap = true;
      }

      const gap = method === 'coverage'
        ? coverageThreshold - coveragePct
        : target - (method === 'averageAll' ? avgAll : method === 'best' ? maxLevel : avgLogged);

      return {
        id: skill.id, name: skill.name,
        category: skill.category_name || 'Uncategorized',
        target, targetLabel: LEVEL_LABELS[target] || `L${target}`,
        avgLogged, avgAll, maxLevel,
        metric, metricLabel,
        gap, coveragePct, atTarget, total: teamSize,
        loggedCount,
        isCore: skill.is_core || false,
        hasGap,
      };
    });

    return { skillGaps, categories, teamSize };
  }, [matrixData, targetOverride, method, coverageThreshold]);

  // Apply filters
  const filtered = useMemo(() => {
    if (!analysis) return [];
    let items = analysis.skillGaps;
    if (filterCategory) items = items.filter(s => s.category === filterCategory);
    if (filterGap === 'gap') items = items.filter(s => s.hasGap);
    if (filterGap === 'met') items = items.filter(s => !s.hasGap);
    if (filterGap === 'core') items = items.filter(s => s.isCore);
    return items.sort((a, b) => b.gap - a.gap);
  }, [analysis, filterCategory, filterGap]);

  // Draw D3 chart
  useEffect(() => {
    if (!filtered.length || !chartRef.current) return;

    const container = chartRef.current;
    d3.select(container).selectAll('*').remove();

    const margin = { top: 20, right: 30, bottom: 100, left: 60 };
    const barWidth = Math.max(30, Math.min(50, (container.clientWidth - margin.left - margin.right) / filtered.length));
    const width = Math.max(filtered.length * barWidth, 300);
    const isCoverage = method === 'coverage';
    const yMax = isCoverage ? 100 : 400;
    const height = 350 - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .domain(filtered.map(d => d.name))
      .range([0, width])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, yMax])
      .range([height, 0]);

    // Grid lines
    const gridVals = isCoverage ? [25, 50, 75, 100] : [100, 200, 300, 400];
    svg.selectAll('.grid')
      .data(gridVals)
      .enter()
      .append('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#333').attr('stroke-dasharray', '3,3');

    if (isCoverage) {
      // Threshold line across entire chart
      svg.append('line')
        .attr('x1', 0).attr('x2', width)
        .attr('y1', y(coverageThreshold)).attr('y2', y(coverageThreshold))
        .attr('stroke', '#e67e22').attr('stroke-width', 2)
        .attr('stroke-dasharray', '6,3');

      // Coverage bars
      svg.selectAll('.coverage-bar')
        .data(filtered)
        .enter()
        .append('rect')
        .attr('x', d => x(d.name))
        .attr('y', d => y(d.coveragePct))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.coveragePct))
        .attr('fill', d => d.hasGap ? '#ff4444' : '#00cc66')
        .attr('stroke', d => d.hasGap ? '#cc0000' : '#009944')
        .attr('stroke-width', 0.5);
    } else {
      // Target marker lines per skill
      svg.selectAll('.target-marker')
        .data(filtered)
        .enter()
        .append('line')
        .attr('x1', d => x(d.name))
        .attr('x2', d => x(d.name) + x.bandwidth())
        .attr('y1', d => y(d.target))
        .attr('y2', d => y(d.target))
        .attr('stroke', '#aaa').attr('stroke-width', 2)
        .attr('stroke-dasharray', '4,2');

      // Proficiency bars
      svg.selectAll('.actual-bar')
        .data(filtered)
        .enter()
        .append('rect')
        .attr('x', d => x(d.name))
        .attr('y', d => y(d.metric))
        .attr('width', x.bandwidth())
        .attr('height', d => height - y(d.metric))
        .attr('fill', d => d.hasGap ? '#ff4444' : '#00cc66')
        .attr('stroke', d => d.hasGap ? '#cc0000' : '#009944')
        .attr('stroke-width', 0.5);
    }

    // X axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('fill', '#999').style('font-size', '10px')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    // Y axis
    const yAxis = isCoverage
      ? d3.axisLeft(y).tickValues([0, 25, 50, 75, 100]).tickFormat(d => `${d}%`)
      : d3.axisLeft(y).tickValues([100, 200, 300, 400]).tickFormat(d => `L${d}`);
    svg.append('g').call(yAxis).selectAll('text').style('fill', '#999');
  }, [filtered, method, coverageThreshold]);

  if (loading) return <div className="loading">Loading gap analysis...</div>;
  if (error || !analysis) return <div className="error">{error || 'Failed to load data'}</div>;

  const gapCount = analysis.skillGaps.filter(s => s.hasGap).length;
  const metCount = analysis.skillGaps.filter(s => !s.hasGap).length;
  const coreGaps = analysis.skillGaps.filter(s => s.isCore && s.hasGap).length;
  const totalCoreSkills = analysis.skillGaps.filter(s => s.isCore).length;
  const methodInfo = METHODS[method];

  // Methodology-aware card subtitles
  const methodShortDesc = method === 'coverage'
    ? `coverage < ${coverageThreshold}%`
    : method === 'averageAll'
      ? 'avg (all) < target'
      : method === 'best'
        ? 'no one at target'
        : 'avg < target';
  const methodMetDesc = method === 'coverage'
    ? `coverage ≥ ${coverageThreshold}%`
    : method === 'averageAll'
      ? 'avg (all) ≥ target'
      : method === 'best'
        ? '≥1 person at target'
        : 'avg ≥ target';

  // Unique key to trigger CSS animation on change
  const cardKey = `${method}-${coverageThreshold}-${targetOverride}`;

  // Column headers change based on method
  const metricColHeader = method === 'coverage' ? 'Coverage' : method === 'best' ? 'Best' : 'Team Avg';
  const gapColHeader = method === 'coverage' ? 'vs Threshold' : 'vs Target';

  return (
    <div className="gap-analysis" style={{ padding: '20px' }}>
      {/* About This View */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => setShowInfo(!showInfo)}
          style={{
            background: 'none', border: '1px solid #444', borderRadius: '6px',
            color: '#8ab4f8', cursor: 'pointer', padding: '6px 14px', fontSize: '13px',
          }}
        >
          {showInfo ? '▾' : '▸'} About this view
        </button>
        {showInfo && (
          <div style={{
            background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px',
            padding: '16px', marginTop: '8px', color: '#bbb', fontSize: '13px', lineHeight: '1.7',
          }}>
            <strong style={{ color: '#eee' }}>How Gap Analysis Works</strong>
            <ul style={{ margin: '8px 0 0 16px', paddingLeft: '0' }}>
              <li><strong>Target level</strong> — each skill has a target proficiency (default L200) set in the
                database. The &ldquo;What-if target&rdquo; override temporarily replaces <em>all</em> skill targets.</li>
              <li><strong>Methodology</strong> — controls <em>how</em> the team is evaluated against the target.
                Choose from four methods in the settings panel below:
                <ul style={{ margin: '4px 0 4px 16px' }}>
                  <li><strong>Team average</strong> — mean proficiency of members who logged the skill</li>
                  <li><strong>Team average (include unlogged)</strong> — same, but unlogged = L0 (stricter)</li>
                  <li><strong>% of team at target</strong> — what fraction of the team reaches the target?
                    You set the threshold (e.g., 50% = at least half the team must be at target)</li>
                  <li><strong>Best on team</strong> — is there at least one person at the target level?</li>
                </ul>
              </li>
              <li><strong>Colors</strong> — <span style={{ color: '#ff4444' }}>red</span> = gap (not meeting criteria),
                <span style={{ color: '#00cc66' }}> green</span> = meeting criteria. The dashed line marks the target
                or threshold.</li>
            </ul>
          </div>
        )}
      </div>

      {/* Methodology Settings */}
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: 'none', border: '1px solid #444', borderRadius: '6px',
            color: '#e67e22', cursor: 'pointer', padding: '6px 14px', fontSize: '13px',
          }}
        >
          {showSettings ? '▾' : '▸'} ⚙ Methodology &amp; Settings
        </button>
        {showSettings && (
          <div style={{
            background: '#1e1e30', border: '1px solid #444', borderRadius: '8px',
            padding: '16px', marginTop: '8px',
          }}>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {/* Method selector */}
              <div>
                <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Gap calculation method
                </div>
                <select value={method} onChange={e => setMethod(e.target.value)} style={selectStyle}>
                  {Object.entries(METHODS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <div style={{ color: '#777', fontSize: '12px', marginTop: '6px', maxWidth: '320px', lineHeight: '1.5' }}>
                  {methodInfo.desc}
                </div>
              </div>

              {/* Coverage threshold — only for coverage method */}
              {method === 'coverage' && (
                <div>
                  <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Coverage threshold
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="range" min="10" max="100" step="5"
                      value={coverageThreshold}
                      onChange={e => setCoverageThreshold(Number(e.target.value))}
                      style={{ width: '120px', accentColor: '#e67e22' }}
                    />
                    <span style={{ color: '#e67e22', fontWeight: 'bold', fontSize: '16px', minWidth: '42px' }}>
                      {coverageThreshold}%
                    </span>
                  </div>
                  <div style={{ color: '#777', fontSize: '12px', marginTop: '4px' }}>
                    At least {coverageThreshold}% of the team ({Math.ceil(analysis.teamSize * coverageThreshold / 100)} of {analysis.teamSize}) must be at target
                  </div>
                </div>
              )}

              {/* Target override */}
              <div>
                <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  What-if target override
                </div>
                <select
                  value={targetOverride}
                  onChange={e => setTargetOverride(e.target.value)}
                  style={targetOverride ? activeSelectStyle : selectStyle}
                >
                  <option value="">Per-skill defaults</option>
                  <option value="100">L100 — Awareness</option>
                  <option value="200">L200 — Working knowledge</option>
                  <option value="300">L300 — Practitioner</option>
                  <option value="400">L400 — Expert</option>
                </select>
                {targetOverride ? (
                  <div style={{ color: '#e67e22', fontSize: '12px', marginTop: '4px', fontStyle: 'italic' }}>
                    ⚡ All skill targets overridden to L{targetOverride}
                  </div>
                ) : (
                  <div style={{ color: '#777', fontSize: '12px', marginTop: '4px' }}>
                    Using each skill&apos;s database target (currently all L200)
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Active methodology indicator */}
      <div style={{
        display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px',
        padding: '8px 14px', background: '#1a1a2e', borderRadius: '6px', border: '1px solid #333',
        fontSize: '12px', color: '#888',
      }}>
        <span>📊</span>
        <span>
          <strong style={{ color: '#ccc' }}>{methodInfo.label}</strong>
          {method === 'coverage' && <span> at <strong style={{ color: '#e67e22' }}>{coverageThreshold}%</strong> threshold</span>}
          {targetOverride && <span> · targets overridden to <strong style={{ color: '#e67e22' }}>L{targetOverride}</strong></span>}
        </span>
      </div>

      {/* Summary Cards — key forces re-mount for CSS animation */}
      <style>{`
        @keyframes cardFlash {
          0% { background: #2a2a4e; }
          100% { background: #1a1a2e; }
        }
        .gap-card { animation: cardFlash 0.6s ease-out; }
      `}</style>
      <div key={cardKey} style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div className="gap-card" style={{ background: '#1a1a2e', borderRadius: '8px', padding: '16px', flex: 1, minWidth: '140px', borderLeft: '4px solid #ff4444' }}>
          <div style={{ color: '#ff4444', fontSize: '28px', fontWeight: 'bold' }}>{gapCount}</div>
          <div style={{ color: '#888', fontSize: '13px' }}>Skills Below Target</div>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>{methodShortDesc}</div>
        </div>
        <div className="gap-card" style={{ background: '#1a1a2e', borderRadius: '8px', padding: '16px', flex: 1, minWidth: '140px', borderLeft: '4px solid #00cc66' }}>
          <div style={{ color: '#00cc66', fontSize: '28px', fontWeight: 'bold' }}>{metCount}</div>
          <div style={{ color: '#888', fontSize: '13px' }}>Skills Meeting Target</div>
          <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>{methodMetDesc}</div>
        </div>
        <div className="gap-card" style={{ background: '#1a1a2e', borderRadius: '8px', padding: '16px', flex: 1, minWidth: '140px', borderLeft: '4px solid #e67e22' }}>
          <div style={{ color: '#e67e22', fontSize: '28px', fontWeight: 'bold' }}>{coreGaps}</div>
          <div style={{ color: '#888', fontSize: '13px' }}>Core Skill Gaps</div>
          {totalCoreSkills === 0 && (
            <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>No skills marked as core</div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value="">All Categories</option>
          {analysis.categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterGap} onChange={e => setFilterGap(e.target.value)} style={selectStyle}>
          <option value="all">All Skills</option>
          <option value="gap">Skills with Gaps</option>
          <option value="met">Skills Meeting Target</option>
          <option value="core">Core Skills Only</option>
        </select>
      </div>

      {/* Chart */}
      <div ref={chartRef} style={{ width: '100%', minHeight: '350px', overflowX: 'auto', marginBottom: '20px' }} />

      {/* Legend */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', fontSize: '13px', color: '#888' }}>
        <span><span style={{ color: '#ff4444' }}>■</span> Below {method === 'coverage' ? 'threshold' : 'target'}</span>
        <span><span style={{ color: '#00cc66' }}>■</span> Meeting {method === 'coverage' ? 'threshold' : 'target'}</span>
        {method === 'coverage'
          ? <span style={{ borderLeft: '2px dashed #e67e22', paddingLeft: '8px' }}>┆ {coverageThreshold}% threshold</span>
          : <span style={{ borderLeft: '2px dashed #555', paddingLeft: '8px' }}>┆ Target level</span>
        }
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px', color: '#888' }}>Skill</th>
            <th style={{ textAlign: 'left', padding: '8px', color: '#888' }}>Category</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>Target</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>{metricColHeader}</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>{gapColHeader}</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>At Target</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>Logged</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(skill => (
            <tr key={skill.id} style={{ borderBottom: '1px solid #222' }}>
              <td style={{ padding: '8px', color: '#eee' }}>
                {skill.isCore && <span title="Core skill">⭐ </span>}
                {skill.name}
              </td>
              <td style={{ padding: '8px', color: '#888' }}>{skill.category}</td>
              <td style={{ textAlign: 'center', padding: '8px', color: '#ccc' }}>{skill.targetLabel}</td>
              <td style={{ textAlign: 'center', padding: '8px', color: '#ccc' }}>{skill.metricLabel}</td>
              <td style={{
                textAlign: 'center', padding: '8px', fontWeight: 'bold',
                color: skill.hasGap ? '#ff4444' : '#00cc66',
              }}>
                {skill.hasGap ? (method === 'coverage' ? `${skill.coveragePct}% < ${coverageThreshold}%` : `−${Math.max(0, skill.gap)}`) : '✓'}
              </td>
              <td style={{ textAlign: 'center', padding: '8px', color: '#888' }}>
                {skill.atTarget}/{skill.total} ({skill.coveragePct}%)
              </td>
              <td style={{ textAlign: 'center', padding: '8px', color: skill.loggedCount === 0 ? '#ff4444' : '#666' }}>
                {skill.loggedCount}/{skill.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default GapAnalysis;
