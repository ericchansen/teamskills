import { useState, useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { getConfig } from '../config';

const LEVEL_NUM = { L100: 100, L200: 200, L300: 300, L400: 400 };

function TrendsChart() {
  const [matrixData, setMatrixData] = useState(null);
  const [trendsData, setTrendsData] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');
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

  useEffect(() => {
    const url = selectedUser
      ? `${API}/api/trends?userId=${selectedUser}`
      : `${API}/api/trends`;
    fetch(url)
      .then(r => r.json())
      .then(setTrendsData)
      .catch(() => setTrendsData([]));
  }, [API, selectedUser]);

  // Process data for the chart
  const chartData = useMemo(() => {
    if (!trendsData.length) return null;

    if (selectedUser) {
      // Per-user: group by skill, show proficiency over time
      const bySkill = {};
      trendsData.forEach(d => {
        if (!bySkill[d.skill_name]) bySkill[d.skill_name] = [];
        bySkill[d.skill_name].push({
          date: new Date(d.changed_at),
          level: LEVEL_NUM[d.proficiency_level],
          category: d.category_name
        });
      });
      return { type: 'user', series: bySkill };
    } else {
      // Team-wide: average proficiency by category over months
      const byCategory = {};
      trendsData.forEach(d => {
        const cat = d.category_name || 'Uncategorized';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({
          date: new Date(d.month),
          level: Number(d.avg_level),
          count: Number(d.user_count)
        });
      });
      return { type: 'team', series: byCategory };
    }
  }, [trendsData, selectedUser]);

  // Draw D3 chart
  useEffect(() => {
    if (!chartData || !chartRef.current) return;

    const container = chartRef.current;
    d3.select(container).selectAll('*').remove();

    const margin = { top: 30, right: 120, bottom: 50, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const allDates = [];
    const allLevels = [];
    Object.values(chartData.series).forEach(points => {
      points.forEach(p => {
        allDates.push(p.date);
        allLevels.push(p.level);
      });
    });

    if (!allDates.length) return;

    const x = d3.scaleTime()
      .domain(d3.extent(allDates))
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([0, 400])
      .range([height, 0]);

    // Axes
    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6))
      .selectAll('text')
      .style('fill', '#999');

    svg.append('g')
      .call(d3.axisLeft(y).tickValues([100, 200, 300, 400]).tickFormat(d => `L${d}`))
      .selectAll('text')
      .style('fill', '#999');

    // Grid lines
    svg.selectAll('.grid-line')
      .data([100, 200, 300, 400])
      .enter()
      .append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', d => y(d))
      .attr('y2', d => y(d))
      .attr('stroke', '#333')
      .attr('stroke-dasharray', '3,3');

    const colors = d3.scaleOrdinal(d3.schemeCategory10);
    const seriesKeys = Object.keys(chartData.series);

    seriesKeys.forEach((key, i) => {
      const points = chartData.series[key].sort((a, b) => a.date - b.date);
      if (points.length < 2) return;

      const line = d3.line()
        .x(d => x(d.date))
        .y(d => y(d.level))
        .curve(d3.curveMonotoneX);

      svg.append('path')
        .datum(points)
        .attr('fill', 'none')
        .attr('stroke', colors(i))
        .attr('stroke-width', 2)
        .attr('d', line);

      // Dots
      svg.selectAll(`.dot-${i}`)
        .data(points)
        .enter()
        .append('circle')
        .attr('cx', d => x(d.date))
        .attr('cy', d => y(d.level))
        .attr('r', 4)
        .attr('fill', colors(i));
    });

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width + 10}, 0)`);

    seriesKeys.forEach((key, i) => {
      const g = legend.append('g')
        .attr('transform', `translate(0, ${i * 20})`);
      g.append('rect')
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', colors(i));
      g.append('text')
        .attr('x', 16)
        .attr('y', 10)
        .attr('fill', '#ccc')
        .attr('font-size', '11px')
        .text(key.length > 15 ? key.slice(0, 15) + '…' : key);
    });
  }, [chartData]);

  if (loading) return <div className="loading">Loading trends...</div>;
  if (!matrixData) return <div className="error">Failed to load data</div>;

  return (
    <div className="trends-chart" style={{ padding: '20px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <label style={{ color: '#ccc' }}>View trends for:</label>
        <select
          value={selectedUser}
          onChange={e => setSelectedUser(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            background: '#2a2a3e',
            color: '#fff',
            border: '1px solid #444'
          }}
        >
          <option value="">Team Average</option>
          {matrixData.users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      {trendsData.length === 0 ? (
        <div style={{ color: '#888', textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: '18px' }}>📊 No trend data yet</p>
          <p style={{ fontSize: '14px' }}>
            Proficiency changes will be tracked automatically.
            As team members update their skill levels, trends will appear here.
          </p>
        </div>
      ) : (
        <div ref={chartRef} style={{ width: '100%', minHeight: '400px' }} />
      )}
    </div>
  );
}

export default TrendsChart;
