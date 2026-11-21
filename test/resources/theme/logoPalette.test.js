import { execFileSync } from 'child_process'

// The wallet theme follows the app logo (asset/brand/saf0o-app-icon-master.png): emerald
// #00a880/#008868 on navy-black. The earlier tan/brown accent must not creep back in.
const tracked = (pattern) =>
  execFileSync('git', ['grep', '-l', '-E', '-e', pattern, '--', 'app', 'resources', 'main'], {
    encoding: 'utf8'
  })
    .split('\n')
    .filter(Boolean)

const grep = (pattern) => {
  try {
    return tracked(pattern)
  } catch {
    return [] // git grep exits 1 when nothing matches
  }
}

it('uses the logo emerald as the primary accent', () => {
  expect(grep('--saf0o-accent-primary #00a880')).toEqual(['resources/base.styl'])
})

it('leaves no brown accent in the styles', () => {
  expect(grep('#a68a61|#b79a70|#947953|166, 138, 97|183, 154, 112|56, 43, 26')).toEqual([])
})
