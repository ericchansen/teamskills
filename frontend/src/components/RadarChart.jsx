import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import apiFetch from '../api';
import './RadarChart.css';

const levelToNum = (level) => {
  if (!level) return 0;
  return parseInt(level.replace('L', ''), 10) / 100; // 1-4 scale
};

function RadarChart({ onUserSelect }) {
  const svgRef = useRef(null);
  const [matrixData, setMatrixData] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [filterCategory, setFilterCategory] = useState('all');
  const [showTeamAvg, setShowTeamAvg] = useState(false);

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

  const skills = useMemo(() => {
    if (!matrixData) return [];
    if (filterCategory === 'all') return matrixData.skills;
    return matrixData.skills.filter(s => s.category_name === filterCategory);
  }, [matrixData, filterCategory]);

  // Build user skill lookup
  const userSkillMap = useMemo(() => {
    if (!matrixData) return {};
    const map = {};
    // userSkills is an object keyed by "userId-skillId"
    Object.entries(matrixData.userSkills).forEach(([key, val]) => {
      const [userId, skillId] = key.split('-').map(Number);
      if (!map[userId]) map[userId] = {};
      map[userId][skillId] = val.proficiency_level;
    });
    return map;
  }, [matrixData]);

  // Compute team average per skill
  const teamAvg = useMemo(() => {
    if (!matrixData) return {};
    const avg = {};
    skills.forEach(skill => {
      const levels = matrixData.users
        .map(u => levelToNum(userSkillMap[u.id]?.[skill.id]))
        .filter(v => v > 0);
      avg[skill.id] = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
    });
    return avg;
  }, [matrixData, skills, userSkillMap]);

  const COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4', '#ec4899'];

  // Draw radar
  useEffect(() => {
    if (!svgRef.current || skills.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth || 500;
    const height = svgRef.current.clientHeight || 500;
    const margin = 60;
    const radius = Math.min(width, height) / 2 - margin;
    const cx = width / 2;
    const cy = height / 2;
    const maxLevel = 4;
    const levels = 4;
    const angleSlice = (2 * Math.PI) / skills.length;

    const g = svg.append('g').attr('transform', `translate(${cx},${cy})`);

    // Grid circles
    for (let i = 1; i <= levels; i++) {
      const r = (radius / levels) * i;
      g.append('circle')
        .attr('r', r)
        .attr('fill', 'none')
        .attr('stroke', '#334155')
        .attr('stroke-width', 0.5)
        .attr('stroke-dasharray', '3,3');

      g.append('text')
        .attr('x', 4)
        .attr('y', -r)
        .attr('fill', '#64748b')
        .attr('font-size', '10px')
        .text(`L${i * 100}`);
    }

    // Axis lines + labels
    skills.forEach((skill, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      g.append('line')
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', x).attr('y2', y)
        .attr('stroke', '#334155')
        .attr('stroke-width', 0.5);

      const labelDist = radius + 18;
      const lx = Math.cos(angle) * labelDist;
      const ly = Math.sin(angle) * labelDist;

      g.append('text')
        .attr('x', lx)
        .attr('y', ly)
        .attr('text-anchor', Math.abs(angle) > Math.PI / 2 ? 'end' : (Math.abs(lx) < 5 ? 'middle' : 'start'))
        .attr('dominant-baseline', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '11px')
        .text(skill.name.length > 16 ? skill.name.slice(0, 14) + '…' : skill.name)
        .append('title')
        .text(skill.name);
    });

    // Draw data for each selected user
    const drawPolygon = (getData, color, label, dashed) => {
      const points = skills.map((skill, i) => {
        const val = getData(skill.id);
        const angle = angleSlice * i - Math.PI / 2;
        const r = (val / maxLevel) * radius;
        return [Math.cos(angle) * r, Math.sin(angle) * r];
      });

      const lineGen = d3.line().curve(d3.curveCardinalClosed.tension(0.3));

      g.append('path')
        .datum(points)
        .attr('d', lineGen)
        .attr('fill', color)
        .attr('fill-opacity', 0.1)
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', dashed ? '5,5' : 'none');

      // Data points
      points.forEach(([px, py], i) => {
        const val = getData(skills[i].id);
        if (val > 0) {
          g.append('circle')
            .attr('cx', px)
            .attr('cy', py)
            .attr('r', 4)
            .attr('fill', color)
            .attr('stroke', '#0f172a')
            .attr('stroke-width', 1.5);
        }
      });
    };

    // Draw team average
    if (showTeamAvg) {
      drawPolygon((skillId) => teamAvg[skillId] || 0, '#64748b', 'Team Avg', true);
    }

    // Draw selected users
    selectedUsers.forEach((userId, idx) => {
      const color = COLORS[idx % COLORS.length];
      drawPolygon(
        (skillId) => levelToNum(userSkillMap[userId]?.[skillId]),
        color,
        null,
        false
      );
    });

  }, [skills, selectedUsers, showTeamAvg, teamAvg, userSkillMap, COLORS]);

  if (!matrixData) return <div className="loading">Loading radar data...</div>;

  return (
    <div className="radar-chart">
      <div className="radar-controls">
        <div className="radar-user-select">
          <label>Compare people:</label>
          <select
            multiple
            value={selectedUsers.map(String)}
            onChange={(e) => {
              const opts = Array.from(e.target.selectedOptions, o => parseInt(o.value));
              setSelectedUsers(opts.slice(0, 6));
            }}
            size={Math.min(matrixData.users.length, 8)}
          >
            {matrixData.users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="radar-options">
          <label>
            Category:
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="all">All</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={showTeamAvg} onChange={(e) => setShowTeamAvg(e.target.checked)} />
            Show Team Average
          </label>
        </div>
        {selectedUsers.length > 0 && (
          <div className="radar-legend">
            {selectedUsers.map((userId, idx) => {
              const user = matrixData.users.find(u => u.id === userId);
              return (
                <span key={userId} className="legend-item">
                  <span className="legend-dot" style={{ background: COLORS[idx % COLORS.length] }} />
                  {user?.name}
                </span>
              );
            })}
            {showTeamAvg && (
              <span className="legend-item">
                <span className="legend-dot dashed" style={{ background: '#64748b' }} />
                Team Average
              </span>
            )}
          </div>
        )}
      </div>
      <svg ref={svgRef} className="radar-svg" />
    </div>
  );
}

export default RadarChart;
