import migration from '../../../../../main/store/migrate/migrations/77'
import { createState } from '../setup'

it('drops persisted Yearn data, which no longer has a consumer', () => {
  const state = createState(76)
  state.main.yearn = { catalogCache: null, workflows: { pending: { id: 'private-workflow' } } }

  const migrated = migration.migrate(state)

  expect(migrated.main).not.toHaveProperty('yearn')
  expect(migrated.main.accounts).toEqual(state.main.accounts)
})
