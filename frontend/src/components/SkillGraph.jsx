import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import apiFetch from '../api';
import './SkillGraph.css';

// Link color - uniform medium grey
const LINK_COLOR = '#999999';

// Coverage-based colors for skill nodes (matching matrix)
const COVERAGE_COLORS = {
  excellent: '#107c10',  // green (score >= 8)
  good: '#0078d4',       // blue (score >= 4)
  fair: '#ca5010',       // orange (score >= 2)
  poor: '#d13438',       // red (score >= 1)
  none: '#6b7280'        // gray (score = 0)
};

// Person node color - neutral grey
const PERSON_COLOR = '#a0a0a0';

// Universal stroke color
const STROKE_COLOR = '#000000';

function SkillGraph({ onUserSelect }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [skillViewBy, setSkillViewBy] = useState('skill'); // 'skill' or 'group'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rawData, setRawData] = useState(null);

  // Convert level to numeric weight for coverage scoring
  const levelToWeight = (level) => {
    if (!level) return 0;
    const num = parseInt(level.replace('L', ''), 10);
    return num / 100; // L100=1, L200=2, L300=3, L400=4
  };

  // Get coverage color based on weighted score
  const getCoverageColor = (score) => {
    if (score >= 8) return COVERAGE_COLORS.excellent;
    if (score >= 4) return COVERAGE_COLORS.good;
    if (score >= 2) return COVERAGE_COLORS.fair;
    if (score >= 1) return COVERAGE_COLORS.poor;
    return COVERAGE_COLORS.none;
  };

  // Convert level to numeric value
  const levelToNum = (level) => {
    if (!level) return 0;
    return parseInt(level.replace('L', ''), 10);
  };

  // Convert numeric average back to level
  const numToLevel = (num) => {
    if (num === 0) return null;
    if (num < 150) return 'L100';
    if (num < 250) return 'L200';
    if (num < 350) return 'L300';
    return 'L400';
  };

  // Fetch data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        const [usersRes, skillsRes, categoriesRes, matrixRes] = await Promise.all([
          apiFetch('/api/users'),
          apiFetch('/api/skills'),
          apiFetch('/api/categories'),
          apiFetch('/api/matrix')
        ]);

        if (!usersRes.ok || !skillsRes.ok || !categoriesRes.ok || !matrixRes.ok) {
          throw new Error('Failed to fetch data');
        }

        const users = await usersRes.json();
        const skills = await skillsRes.json();
        const categories = await categoriesRes.json();
        const matrix = await matrixRes.json();

        // Store raw data for rebuilding graph when view changes
        setRawData({ users, skills, categories, matrix });
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Build graph data based on skillViewBy setting
  useEffect(() => {
    if (!rawData) return;

    const { users, skills, categories, matrix } = rawData;
    const nodes = [];
    const links = [];

    // Add user nodes
    users.forEach(user => {
      const initials = user.name.split(' ').map(n => n[0]).join('');
      nodes.push({
        id: `p${user.id}`,
        odataId: user.id,
        name: user.name,
        type: 'person',
        role: user.role || 'Team Member',
        team: user.team || '',
        initials,
        radius: 28
      });
    });

    if (skillViewBy === 'group') {
      // Group view: one node per category
      const categoryNames = [...new Set(skills.map(s => s.category_name))];
      
      categoryNames.forEach(catName => {
        const catSkills = skills.filter(s => s.category_name === catName);
        
        // Calculate coverage score for this category
        let coverageScore = 0;
        const peopleInCategory = new Set();
        
        users.forEach(user => {
          catSkills.forEach(skill => {
            const key = `${user.id}-${skill.id}`;
            const userSkill = matrix.userSkills[key];
            if (userSkill?.proficiency_level) {
              peopleInCategory.add(user.id);
              coverageScore += levelToWeight(userSkill.proficiency_level);
            }
          });
        });
        
        const totalPeople = peopleInCategory.size;

        nodes.push({
          id: `g${catName}`,
          name: catName,
          type: 'skill',
          isGroup: true,
          category: catName,
          coverageScore: coverageScore,
          coverageColor: getCoverageColor(coverageScore / catSkills.length), // Average per skill
          peopleCount: totalPeople,
          skillCount: catSkills.length,
          radius: 20 + totalPeople * 2
        });
      });

      // Add person-group links with averaged proficiency
      users.forEach(user => {
        const categoryNames = [...new Set(skills.map(s => s.category_name))];
        
        categoryNames.forEach(catName => {
          const catSkills = skills.filter(s => s.category_name === catName);
          const levels = [];
          
          catSkills.forEach(skill => {
            const key = `${user.id}-${skill.id}`;
            const userSkill = matrix.userSkills[key];
            if (userSkill?.proficiency_level) {
              levels.push(levelToNum(userSkill.proficiency_level));
            }
          });
          
          if (levels.length > 0) {
            const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
            const level = numToLevel(avgLevel);
            links.push({
              source: `p${user.id}`,
              target: `g${catName}`,
              level: level,
              color: LINK_COLOR,
              strength: level === 'L400' ? 0.8 : level === 'L300' ? 0.5 : 0.3
            });
          }
        });
      });
    } else {
      // Skill view: one node per skill
      skills.forEach(skill => {
        const category = categories.find(c => c.id === skill.category_id);
        const categoryName = category?.name || skill.category_name || 'Other';
        
        // Calculate coverage score for this skill
        let coverageScore = 0;
        let peopleCount = 0;
        
        users.forEach(user => {
          const key = `${user.id}-${skill.id}`;
          const userSkill = matrix.userSkills[key];
          if (userSkill?.proficiency_level) {
            peopleCount++;
            coverageScore += levelToWeight(userSkill.proficiency_level);
          }
        });
        
        nodes.push({
          id: `s${skill.id}`,
          skillId: skill.id,
          name: skill.name,
          type: 'skill',
          isGroup: false,
          category: categoryName,
          coverageScore: coverageScore,
          coverageColor: getCoverageColor(coverageScore),
          peopleCount: peopleCount,
          radius: 12 + peopleCount * 3
        });
      });

      // Add person-skill links
      users.forEach(user => {
        skills.forEach(skill => {
          const key = `${user.id}-${skill.id}`;
          const userSkill = matrix.userSkills[key];
          if (userSkill && userSkill.proficiency_level) {
            links.push({
              source: `p${user.id}`,
              target: `s${skill.id}`,
              level: userSkill.proficiency_level,
              color: LINK_COLOR,
              strength: userSkill.proficiency_level === 'L400' ? 0.8 : 
                        userSkill.proficiency_level === 'L300' ? 0.5 : 0.3
            });
          }
        });
      });
    }

    setGraphData({ nodes, links, users, skills, categories, matrix });
  }, [rawData, skillViewBy]);

  // Initialize and update D3 graph
  useEffect(() => {
    if (loading || error || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear existing SVG
    d3.select(container).selectAll('svg').remove();

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    svgRef.current = svg;

    // Create zoom behavior
    const g = svg.append('g');
    
    svg.call(d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      }));

    // Get data
    const { nodes, links } = graphData;

    // Create simulation - spread nodes apart more
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(180).strength(d => d.strength || 0.2))
      .force('charge', d3.forceManyBody().strength(-600))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.radius + 15));

    simulationRef.current = simulation;

    // Create links - uniform grey
    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'graph-link')
      .attr('stroke', LINK_COLOR)
      .attr('stroke-width', 1);

    // Create node groups
    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', d => `graph-node graph-node-${d.type}`)
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }))
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
        highlightConnections(d, node, link, links);
        
        if (d.type === 'person' && onUserSelect) {
          onUserSelect(d.odataId);
        }
      });

    // Person nodes - solid blue
    // Person nodes - grey with black stroke
    node.filter(d => d.type === 'person')
      .append('circle')
      .attr('r', d => d.radius)
      .attr('fill', PERSON_COLOR)
      .attr('stroke', STROKE_COLOR)
      .attr('stroke-width', 1.5);

    node.filter(d => d.type === 'person')
      .append('text')
      .text(d => d.initials)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#000000')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .style('pointer-events', 'none');

    // Skill nodes - coverage-based coloring with black stroke
    node.filter(d => d.type === 'skill')
      .append('circle')
      .attr('r', d => d.radius)
      .attr('fill', d => d.coverageColor)
      .attr('stroke', STROKE_COLOR)
      .attr('stroke-width', 1.5);

    // Labels - light colored for dark background
    node.filter(d => d.type === 'skill')
      .append('text')
      .text(d => d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 14)
      .attr('fill', '#e0e0e0')
      .attr('font-size', '10px')
      .style('pointer-events', 'none');

    node.filter(d => d.type === 'person')
      .append('text')
      .text(d => d.name)
      .attr('text-anchor', 'middle')
      .attr('dy', d => d.radius + 14)
      .attr('fill', '#e0e0e0')
      .attr('font-size', '10px')
      .attr('font-weight', '500')
      .style('pointer-events', 'none');

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Click outside to clear selection
    svg.on('click', () => {
      setSelectedNode(null);
      node.classed('dimmed', false);
      link.classed('dimmed', false);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [graphData, loading, error, onUserSelect]);

  // Handle search filtering
  useEffect(() => {
    if (!svgRef.current || loading) return;
    
    const svg = svgRef.current;
    const nodes = svg.selectAll('.graph-node');
    const links = svg.selectAll('.graph-link');

    if (!searchQuery) {
      nodes.classed('dimmed', false);
      links.classed('dimmed', false);
      return;
    }

    const query = searchQuery.toLowerCase();
    nodes.classed('dimmed', d => !d.name.toLowerCase().includes(query));
    links.classed('dimmed', true);
  }, [searchQuery, loading]);

  const highlightConnections = (selectedNode, nodeSelection, linkSelection, allLinks) => {
    if (selectedNode.type === 'skill') {
      const connectedPeople = allLinks
        .filter(l => l.target.id === selectedNode.id || (l.target === selectedNode.id))
        .map(l => typeof l.source === 'object' ? l.source.id : l.source);

      nodeSelection.classed('dimmed', d => {
        if (d.id === selectedNode.id) return false;
        if (d.type === 'person' && connectedPeople.includes(d.id)) return false;
        return true;
      });
    } else {
      const connectedSkills = allLinks
        .filter(l => l.source.id === selectedNode.id || (l.source === selectedNode.id))
        .map(l => typeof l.target === 'object' ? l.target.id : l.target);

      nodeSelection.classed('dimmed', d => {
        if (d.id === selectedNode.id) return false;
        if (d.type === 'skill' && connectedSkills.includes(d.id)) return false;
        return true;
      });
    }

    linkSelection.classed('dimmed', d => {
      const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
      const targetId = typeof d.target === 'object' ? d.target.id : d.target;
      return sourceId !== selectedNode.id && targetId !== selectedNode.id;
    });
  };

  const getPeopleWithSkill = (skillId) => {
    if (!graphData.matrix?.users) return [];
    return graphData.matrix.users
      .filter(u => u.skills?.some(s => s.skill_id === skillId && s.proficiency_level))
      .map(u => ({
        ...u,
        level: u.skills.find(s => s.skill_id === skillId)?.proficiency_level
      }))
      .sort((a, b) => {
        const order = { L400: 0, L300: 1, L200: 2, L100: 3 };
        return order[a.level] - order[b.level];
      });
  };

  const getPersonSkills = (personId) => {
    const user = graphData.matrix?.users?.find(u => u.id === personId);
    if (!user?.skills) return {};
    
    const byLevel = { L400: [], L300: [], L200: [], L100: [] };
    user.skills.forEach(s => {
      if (s.proficiency_level) {
        const skill = graphData.skills?.find(sk => sk.id === s.skill_id);
        if (skill) {
          const category = graphData.categories?.find(c => c.id === skill.category_id);
          byLevel[s.proficiency_level].push({ ...skill, category: category?.name });
        }
      }
    });
    return byLevel;
  };

  if (loading) {
    return (
      <div className="skill-graph-container">
        <div className="graph-loading">Loading skills graph...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="skill-graph-container">
        <div className="graph-error">Error loading data: {error}</div>
      </div>
    );
  }

  return (
    <div className="skill-graph-container">
      {/* Header Controls */}
      <div className="graph-controls">
        <div className="graph-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search skills or people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="skill-view-toggle">
          <button
            className={skillViewBy === 'skill' ? 'active' : ''}
            onClick={() => setSkillViewBy('skill')}
          >
            By Skill
          </button>
          <button
            className={skillViewBy === 'group' ? 'active' : ''}
            onClick={() => setSkillViewBy('group')}
          >
            By Group
          </button>
        </div>
      </div>

      {/* Graph */}
      <div className="graph-canvas" ref={containerRef} />

      {/* Legend */}
      <div className="graph-legend">
        <div className="legend-section">
          <div className="legend-title">Nodes</div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: PERSON_COLOR }} />
            <span>Person</span>
          </div>
        </div>
        <div className="legend-section">
          <div className="legend-title">Skill Coverage</div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: COVERAGE_COLORS.excellent }} />
            <span>Excellent</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: COVERAGE_COLORS.good }} />
            <span>Good</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: COVERAGE_COLORS.fair }} />
            <span>Fair</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: COVERAGE_COLORS.poor }} />
            <span>Limited</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot" style={{ background: COVERAGE_COLORS.none }} />
            <span>None</span>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="graph-instructions">
        <strong>Click a skill</strong> to see who has it<br />
        <strong>Click a person</strong> to view their profile<br />
        <strong>Drag nodes</strong> to rearrange
      </div>

      {/* Side Panel */}
      {selectedNode && (
        <div className="graph-side-panel">
          <button className="panel-close" onClick={() => setSelectedNode(null)}>×</button>
          
          {selectedNode.type === 'skill' ? (
            <>
              <div className="panel-header">
                <h3>{selectedNode.name}</h3>
                <span className="panel-category">{selectedNode.category}</span>
              </div>
              <div className="panel-section">
                <div className="panel-section-title">
                  Team Members ({getPeopleWithSkill(selectedNode.skillId).length})
                </div>
                {getPeopleWithSkill(selectedNode.skillId).map(person => (
                  <div 
                    key={person.id} 
                    className="person-card"
                    onClick={() => onUserSelect && onUserSelect(person.id)}
                  >
                    <div className="person-avatar">
                      {person.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="person-info">
                      <div className="person-name">{person.name}</div>
                      <div className="person-role">{person.role || 'Team Member'}</div>
                    </div>
                    <span className={`proficiency-badge ${person.level}`}>{person.level}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="panel-header">
                <h3>{selectedNode.name}</h3>
                <span className="panel-category">{selectedNode.role}</span>
              </div>
              {Object.entries(getPersonSkills(selectedNode.odataId)).map(([level, skills]) => (
                skills.length > 0 && (
                  <div key={level} className="panel-section">
                    <div className="panel-section-title">{level} ({skills.length})</div>
                    {skills.map(skill => (
                      <div key={skill.id} className="skill-card">
                        <div className="skill-name">{skill.name}</div>
                        <div className="skill-category">{skill.category}</div>
                      </div>
                    ))}
                  </div>
                )
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default SkillGraph;
