// counter.js
export const counters = {
  total: 0,
  byType: Object.create(null),
}

export const resetCounters = () => {
  counters.total = 0
  counters.byType = Object.create(null)
}

export const count = (type) => {
  counters.total += 1
  counters.byType[type] = (counters.byType[type] ?? 0) + 1
}
