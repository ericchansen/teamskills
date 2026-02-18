import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import apiFetch from '../api';
import './CoverageDashboard.css';

const LEVEL_COLORS = {
  L100: '#3b82f6',
  L200: '#22c55e',
  L300: '#f59e0b',
  L400: '#ef4444',
};

function CoverageDashboard() {
  const svgRef = useRef(null);
  const [matrixData, setMatrixData] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'coverage', 'busFactor'

  useEffect(() => {
    apiFetch('/api/matrix')
      .then(res => res.json())
      .then(data => setMatrixData(data))
      .catch(err => console.error('Failed to fetch matrix:', err));
  }, []);

  const categories = useMemo(() => {
    if (!matrixData) return [];
    return [...new Set(matrixData.skills.map(s => s.category_name))].sort();
  }, [matrixData]);

  const skillStats = useMemo(() => {
    if (!matrixData) return [];

    const filteredSkills = filterCategory === 'all'
      ? matrixData.skills
      : matrixData.skills.filter(s => s.category_name === filterCategory);

    // Build lookup
    const skillMap = {};
    matrixData.userSkills.forEach(us => {
      if (!skillMap[us.skill_id]) skillMap[us.skill_id] = [];
      skillMap[us.skill_id].push(us.proficiency_level);
    });

    const stats = filteredSkills.map(skill => {
      const levels = skillMap[skill.id] || [];
      const counts = { L100: 0, L200: 0, L300: 0, L400: 0 };
      levels.forEach(l => { if (counts[l] !== undefined) counts[l]++; });
      const total = levels.length;
      const advanced = counts.L300 + counts.L400; // L300+ people
      return {
        id: skill.id,
        name: skill.name,
        category: skill.category_name,
        counts,
        total,
        busFactor: advanced, // How many people at L300+
      };
    });

    if (sortBy === 'coverage') {
      stats.sort((a, b) => b.total - a.total);
    } else if (sortBy === 'busFactor') {
      stats.sort((a, b) => a.busFactor - b.busFactor);
    } else {
      stats.sort((a, b) => a.name.localeCompare(b.name));
    }

    return stats;
  }, [matrixData, filterCategory, sortBy]);

  // Draw chart
  useEffect(() => {
    if (!svgRef.current || skillStats.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const containerWidth = svgRef.current.clientWidth || 800;
    const barHeight = 26;
    const margin = { top: 10, right: 30, bottom: 40, left: 200 };
    const width = containerWidth - margin.left - margin.right;
    const height = skillStats.length * barHeight;

    svg.attr('width', containerWidth).attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxPeople = d3.max(skillStats, d => d.total) || 1;
    const x = d3.scaleLinear().domain([0, maxPeople]).range([0, width]);
    const y = d3.scaleBand()
      .domain(skillStats.map(d => d.name))
      .range([0, height])
      .padding(0.2);

    // X axis
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(Math.min(maxPeople, 10)).tickFormat(d3.format('d')))
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-size', '11px');

    g.selectAll('.domain, .tick line').attr('stroke', '#334155');

    // Stacked bars
    const levelOrder = ['L100', 'L200', 'L300', 'L400'];

    skillStats.forEach(skill => {
      let xOffset = 0;
      levelOrder.forEach(level => {
        const count = skill.counts[level];
        if (count > 0) {
          g.append('rect')
            .attr('x', x(xOffset))
            .attr('y', y(skill.name))
            .attr('width', x(count) - x(0))
            .attr('height', y.bandwidth())
            .attr('fill', LEVEL_COLORS[level])
            .attr('rx', 2)
            .append('title')
            .text(`${skill.name}: ${count} at ${level}`);
          xOffset += count;
        }
      });

      // Bus factor indicator
      if (skill.busFactor <= 1) {
        g.append('text')
          .attr('x', x(skill.total) + 6)
          .attr('y', y(skill.name) + y.bandwidth() / 2)
          .attr('dominant-baseline', 'middle')
          .attr('fill', skill.busFactor === 0 ? '#ef4444' : '#f59e0b')
          .attr('font-size', '12px')
          .text(skill.busFactor === 0 ? '⚠️ No experts' : '⚡ Bus factor: 1');
      }
    });

    // Y axis (skill names)
    g.append('g')
      .call(d3.axisLeft(y).tickSize(0))
      .selectAll('text')
      .attr('fill', '#cbd5e1')
      .attr('font-size', '11px')
      .style('cursor', 'default')
      .each(function (d) {
        const text = d3.select(this);
        if (d.length > 24) {
          text.text(d.slice(0, 22) + '…');
          text.append('title').text(d);
        }
      });

    g.select('.domain').attr('stroke', '#334155');

  }, [skillStats]);

  if (!matrixData) return <div className="loading">Loading coverage data...</div>;

  return (
    <div className="coverage-dashboard">
      <div className="coverage-controls">
        <label>
          Category:
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="all">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Sort:
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="name">Name</option>
            <option value="coverage">Most Covered</option>
            <option value="busFactor">Lowest Bus Factor</option>
          </select>
        </label>
        <div className="coverage-legend">
          {Object.entries(LEVEL_COLORS).map(([level, color]) => (
            <span key={level} className="legend-item">
              <span className="legend-swatch" style={{ background: color }} />
              {level}
            </span>
          ))}
        </div>
      </div>
      <div className="coverage-chart-container">
        <svg ref={svgRef} className="coverage-svg" />
      </div>
    </div>
  );
}

export default CoverageDashboard;
