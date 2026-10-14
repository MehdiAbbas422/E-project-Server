const isPastExpoDate = (date) => {
  const expoDate = new Date(date)
  const today = new Date()
  expoDate.setUTCHours(0, 0, 0, 0)
  today.setUTCHours(0, 0, 0, 0)
  return expoDate < today
}

module.exports = { isPastExpoDate }