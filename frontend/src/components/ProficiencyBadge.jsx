import React from 'react';
import './ProficiencyBadge.css';

const PROFICIENCY_CONFIG = {
  L100: { 
    label: 'L100 - Awareness', 
    shortLabel: 'L100',
    description: 'Knows basics; would need support for deeper work',
    color: '#d13438', 
    bgColor: '#ffe5e6' 
  },
  L200: { 
    label: 'L200 - Understanding', 
    shortLabel: 'L200',
    description: 'Could host a discovery session',
    color: '#ca5010', 
    bgColor: '#fff4ce' 
  },
  L300: { 
    label: 'L300 - Practitioner', 
    shortLabel: 'L300',
    description: 'Could speak competently about it',
    color: '#0078d4', 
    bgColor: '#deecf9' 
  },
  L400: { 
    label: 'L400 - Expert', 
    shortLabel: 'L400',
    description: 'Could teach or lead a workshop',
    color: '#107c10', 
    bgColor: '#dff6dd' 
  }
};

function ProficiencyBadge({ level, compact = false, showDescription = false }) {
  if (!level || !PROFICIENCY_CONFIG[level]) {
    return null;
  }

  const config = PROFICIENCY_CONFIG[level];
  
  return (
    <span 
      className={`proficiency-badge ${compact ? 'compact' : ''} ${showDescription ? 'with-description' : ''}`}
      style={{ 
        backgroundColor: config.bgColor,
        color: config.color,
        borderColor: config.color
      }}
      title={config.description}
    >
      {compact ? config.shortLabel : config.label}
      {showDescription && <span className="badge-description">{config.description}</span>}
    </span>
  );
}

export { PROFICIENCY_CONFIG };
export default ProficiencyBadge;
