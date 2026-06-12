/**
 * Returns today's date as YYYY-MM-DD in LOCAL time.
 * Never use toISOString().slice(0,10) for calendar
 * dates — that returns UTC which may be a different
 * day for US users in the evening.
 *
 * @param {Date} [date=new Date()] - Optional date object
 * @returns {string} YYYY-MM-DD in local timezone
 */
export function getLocalDateString(date = new Date()) {
  const year  = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day   = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Returns a date string N days ago in local time.
 * @param {number} daysAgo
 * @returns {string} YYYY-MM-DD
 */
export function getDaysAgoString(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return getLocalDateString(d)
}

/**
 * Returns the first day of the current month
 * in local time.
 * @returns {string} YYYY-MM-DD
 */
export function getMonthStartString() {
  const d = new Date()
  d.setDate(1)
  return getLocalDateString(d)
}
