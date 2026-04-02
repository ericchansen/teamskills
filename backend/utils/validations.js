const VALID_PROFICIENCY_LEVELS = ['L100', 'L200', 'L300', 'L400'];

function validateProficiencyLevel(level) {
  return VALID_PROFICIENCY_LEVELS.includes(level);
}

module.exports = { VALID_PROFICIENCY_LEVELS, validateProficiencyLevel };
