import { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { getConfig } from '../config';

const LEVEL_NUM = { L100: 100, L200: 200, L300: 300, L400: 400 };
const LEVEL_LABELS = { 100: 'L100', 200: 'L200', 300: 'L300', 400: 'L400' };

function GapAnalysis() {
  const [matrixData, setMatrixData] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterGap, setFilterGap] = useState('all'); // all, gap, met, core
  const [loading, setLoading] = useState(true);
  const chartRef = useRef(null);

  const config = getConfig();
  const API = config.VITE_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetch(`${API}/api/matrix`)
      .then(r => r.json())
      .then(data => { setMatrixData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [API]);

  // Compute gap analysis
  const analysis = useMemo(() => {
    if (!matrixData) return null;

    const { users, skills, userSkills } = matrixData;
    const categories = [...new Set(skills.map(s => s.category_name).filter(Boolean))].sort();

    const skillGaps = skills.map(skill => {
      const target = LEVEL_NUM[skill.target_level] || 200;
      const proficiencies = users.map(u => {
        const key = `${u.id}-${skill.id}`;
        const entry = userSkills[key];
        return entry ? LEVEL_NUM[entry.proficiency_level] || 0 : 0;
      }).filter(p => p > 0);

      const avgLevel = proficiencies.length > 0
        ? Math.round(proficiencies.reduce((a, b) => a + b, 0) / proficiencies.length)
        : 0;
      const maxLevel = proficiencies.length > 0 ? Math.max(...proficiencies) : 0;
      const atTarget = proficiencies.filter(p => p >= target).length;
      const total = users.length;
      const coverage = total > 0 ? Math.round((atTarget / total) * 100) : 0;
      const gap = target - avgLevel;

      return {
        id: skill.id,
        name: skill.name,
        category: skill.category_name || 'Uncategorized',
        target,
        targetLabel: LEVEL_LABELS[target] || `L${target}`,
        avgLevel,
        maxLevel,
        gap,
        coverage,
        atTarget,
        total,
        isCore: skill.is_core || false,
        hasGap: avgLevel < target
      };
    });

    return { skillGaps, categories };
  }, [matrixData]);

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
      .domain([0, 400])
      .range([height, 0]);

    // Grid
    svg.selectAll('.grid')
      .data([100, 200, 300, 400])
      .enter()
      .append('line')
      .attr('x1', 0).attr('x2', width)
      .attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', '#333').attr('stroke-dasharray', '3,3');

    // Target bars (background)
    svg.selectAll('.target-bar')
      .data(filtered)
      .enter()
      .append('rect')
      .attr('x', d => x(d.name))
      .attr('y', d => y(d.target))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.target))
      .attr('fill', '#2a2a3e')
      .attr('stroke', '#555')
      .attr('stroke-dasharray', '4,2');

    // Actual bars
    svg.selectAll('.actual-bar')
      .data(filtered)
      .enter()
      .append('rect')
      .attr('x', d => x(d.name))
      .attr('y', d => y(d.avgLevel))
      .attr('width', x.bandwidth())
      .attr('height', d => height - y(d.avgLevel))
      .attr('fill', d => d.hasGap ? '#e74c3c' : '#27ae60')
      .attr('opacity', 0.8);

    // X axis
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .style('fill', '#999')
      .style('font-size', '10px')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    // Y axis
    svg.append('g')
      .call(d3.axisLeft(y).tickValues([100, 200, 300, 400]).tickFormat(d => `L${d}`))
      .selectAll('text')
      .style('fill', '#999');
  }, [filtered]);

  if (loading) return <div className="loading">Loading gap analysis...</div>;
  if (!analysis) return <div className="error">Failed to load data</div>;

  const gapCount = analysis.skillGaps.filter(s => s.hasGap).length;
  const metCount = analysis.skillGaps.filter(s => !s.hasGap).length;
  const coreGaps = analysis.skillGaps.filter(s => s.isCore && s.hasGap).length;

  return (
    <div className="gap-analysis" style={{ padding: '20px' }}>
      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ background: '#1a1a2e', borderRadius: '8px', padding: '16px', flex: 1, minWidth: '140px', borderLeft: '4px solid #e74c3c' }}>
          <div style={{ color: '#e74c3c', fontSize: '28px', fontWeight: 'bold' }}>{gapCount}</div>
          <div style={{ color: '#888', fontSize: '13px' }}>Skills Below Target</div>
        </div>
        <div style={{ background: '#1a1a2e', borderRadius: '8px', padding: '16px', flex: 1, minWidth: '140px', borderLeft: '4px solid #27ae60' }}>
          <div style={{ color: '#27ae60', fontSize: '28px', fontWeight: 'bold' }}>{metCount}</div>
          <div style={{ color: '#888', fontSize: '13px' }}>Skills Meeting Target</div>
        </div>
        <div style={{ background: '#1a1a2e', borderRadius: '8px', padding: '16px', flex: 1, minWidth: '140px', borderLeft: '4px solid #e67e22' }}>
          <div style={{ color: '#e67e22', fontSize: '28px', fontWeight: 'bold' }}>{coreGaps}</div>
          <div style={{ color: '#888', fontSize: '13px' }}>Core Skill Gaps</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: '6px', background: '#2a2a3e', color: '#fff', border: '1px solid #444' }}
        >
          <option value="">All Categories</option>
          {analysis.categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterGap}
          onChange={e => setFilterGap(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: '6px', background: '#2a2a3e', color: '#fff', border: '1px solid #444' }}
        >
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
        <span><span style={{ color: '#e74c3c' }}>■</span> Below target</span>
        <span><span style={{ color: '#27ae60' }}>■</span> Meeting target</span>
        <span style={{ borderLeft: '2px dashed #555', paddingLeft: '8px' }}>┆ Target level</span>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #333' }}>
            <th style={{ textAlign: 'left', padding: '8px', color: '#888' }}>Skill</th>
            <th style={{ textAlign: 'left', padding: '8px', color: '#888' }}>Category</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>Target</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>Team Avg</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>Gap</th>
            <th style={{ textAlign: 'center', padding: '8px', color: '#888' }}>At Target</th>
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
              <td style={{ textAlign: 'center', padding: '8px', color: '#ccc' }}>
                {skill.avgLevel > 0 ? LEVEL_LABELS[Math.round(skill.avgLevel / 100) * 100] || `~${skill.avgLevel}` : '—'}
              </td>
              <td style={{ textAlign: 'center', padding: '8px', color: skill.hasGap ? '#e74c3c' : '#27ae60', fontWeight: 'bold' }}>
                {skill.hasGap ? `−${skill.gap}` : '✓'}
              </td>
              <td style={{ textAlign: 'center', padding: '8px', color: '#888' }}>
                {skill.atTarget}/{skill.total} ({skill.coverage}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default GapAnalysis;
