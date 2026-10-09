// Purpose: Builds a skip/limit object from `?page=&limit=` query params.
// Returns null when no page was requested so routes can keep returning a plain
// array for backwards compatibility (and use pagination only when asked).
const getPagination = (req, defaultLimit = 9) => {
  const page = Number(req.query.page)
  if (!page || page < 1) return null
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), 50)
  return { page, limit, skip: (page - 1) * limit }
}

/**
 * Runs a paginated query and shapes the standard response:
 * { items, total, page, pages, limit }.
 */
const paginatedResponse = async (Model, query, options = {}, p) => {
  const { sort = {}, populate = null, select = null } = options
  const find = Model.find(query).sort(sort).skip(p.skip).limit(p.limit)
  if (populate) {
    const populates = Array.isArray(populate) ? populate : [populate]
    populates.forEach((pop) => find.populate(pop))
  }
  if (select) find.select(select)

  const [items, total] = await Promise.all([find, Model.countDocuments(query)])
  return { items, total, page: p.page, pages: Math.ceil(total / p.limit) || 1, limit: p.limit }
}

module.exports = { getPagination, paginatedResponse }
