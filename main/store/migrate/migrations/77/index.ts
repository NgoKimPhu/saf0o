import { z } from 'zod'

const StateSchema = z.object({ main: z.object({}).passthrough() }).passthrough()

// The Yearn Earn feature is removed: drop its persisted catalog cache and workflows.
const migrate = (initial: unknown) => {
  const parsed = StateSchema.safeParse(initial)
  if (!parsed.success) return initial

  const { yearn: _yearn, ...main } = parsed.data.main
  return { ...parsed.data, main }
}

export default { version: 77, migrate }
