import React from 'react';
import './ProficiencyBadge.css';

/**
 * Proficiency level definitions adapted from the Microsoft L100–L400 technical
 * session-level taxonomy used across Microsoft Learn, Ignite, and CSU Tech
 * Intensity Skill Proficiency Standards.
 *
 * Public reference: https://learn.microsoft.com/en-us/microsoft-365/community/microsoft-maturity-model-how-to-staff-and-training
 * Internal reference: Microsoft CSU Tech Intensity Skill Proficiency Standards (SharePoint, internal only)
 *
 * Descriptions below are paraphrased for a skills-tracker context.
 * Colors use Microsoft Fluent UI palette values.
 */
const PROFICIENCY_CONFIG = {
  L100: {
    label: 'L100 - Foundational',
    shortLabel: 'L100',
    description: 'Understands core concepts and terminology; applies learning in guided scenarios with support',
    color: '#d13438',
    bgColor: '#ffe5e6',
  },
  L200: {
    label: 'L200 - Intermediate',
    shortLabel: 'L200',
    description: 'Applies skills in standard scenarios with growing independence; adapts to moderate complexity',
    color: '#ca5010',
    bgColor: '#fff4ce',
  },
  L300: {
    label: 'L300 - Advanced',
    shortLabel: 'L300',
    description: 'Solves complex, ambiguous problems with high autonomy; coaches peers informally',
    color: '#0078d4',
    bgColor: '#deecf9',
  },
  L400: {
    label: 'L400 - Expert',
    shortLabel: 'L400',
    description: 'Recognized authority who shapes best practices, mentors others, and drives strategic impact',
    color: '#107c10',
    bgColor: '#dff6dd',
  },
};

/** Chart-friendly color lookup derived from the canonical config above. */
const LEVEL_COLORS = Object.fromEntries(
  Object.entries(PROFICIENCY_CONFIG).map(([k, v]) => [k, v.color])
);

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

export { PROFICIENCY_CONFIG, LEVEL_COLORS };
export default ProficiencyBadge;
