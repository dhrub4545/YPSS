const nd = require('nepali-date-converter');
const NepaliDate = nd.default || nd;

/**
 * Formats a Gregorian JS Date (or date string) to Nepali BS date string (YYYY-MM-DD).
 * @param {Date|string} date 
 * @returns {string}
 */
function formatADtoBS(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return new NepaliDate(d).format('YYYY-MM-DD');
  } catch (error) {
    return '';
  }
}

/**
 * Parses a Nepali BS date string (YYYY-MM-DD) into a Gregorian JS Date object.
 * @param {string} bsDateString 
 * @returns {Date|null}
 */
function parseBStoAD(bsDateString) {
  if (!bsDateString || typeof bsDateString !== 'string') return null;
  try {
    const trimmed = bsDateString.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    return new NepaliDate(trimmed).toJsDate();
  } catch (error) {
    return null;
  }
}

module.exports = {
  formatADtoBS,
  parseBStoAD
};
