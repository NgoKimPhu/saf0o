import {
  FRAME_SEND_ORIGIN,
  SAF0O_DEPLOY_DISPLAY_NAME,
  SAF0O_DEPLOY_ORIGIN,
  SAF0O_INTERNAL_ORIGIN,
  getManagedOriginNameForId,
  getOriginDisplayName,
  isManagedOriginName,
  isSaf0oOwnedOriginName,
  originIdForInvoker
} from '../../../../resources/domain/origin'

test('defines a distinct exact managed deployment principal and friendly display name', () => {
  const deployId = originIdForInvoker(SAF0O_DEPLOY_ORIGIN, { provenance: 'managed' })
  const sendId = originIdForInvoker(FRAME_SEND_ORIGIN, { provenance: 'managed' })

  expect(SAF0O_DEPLOY_ORIGIN).toBe('http://deploy.saf0o.localhost:8421')
  expect(deployId).toBe('b28720ba-585d-5a20-a021-d85274e6e654')
  expect(deployId).not.toBe(sendId)
  expect(getOriginDisplayName(SAF0O_DEPLOY_ORIGIN)).toBe(SAF0O_DEPLOY_DISPLAY_NAME)
  expect(getManagedOriginNameForId(deployId)).toBe(SAF0O_DEPLOY_ORIGIN)
})

test('classifies only exact Saf0o-owned origin names', () => {
  expect(isManagedOriginName(FRAME_SEND_ORIGIN)).toBe(true)
  expect(isManagedOriginName(SAF0O_DEPLOY_ORIGIN)).toBe(true)
  expect(isSaf0oOwnedOriginName(SAF0O_INTERNAL_ORIGIN)).toBe(true)
  expect(isSaf0oOwnedOriginName('frame-extension')).toBe(true)
  expect(isManagedOriginName(`${SAF0O_DEPLOY_ORIGIN}/`)).toBe(false)
  expect(isSaf0oOwnedOriginName('https://app.example')).toBe(false)
})

test.each([
  'https://send.frame.eth.localhost:8421',
  'http://send.frame.eth.localhost:8421/',
  'http://send.frame.eth.localhost:8421.example.com',
  'https://deploy.saf0o.localhost:8421',
  'http://deploy.saf0o.localhost:8421/'
])('does not label a lookalike origin: %s', (origin) => {
  expect(getOriginDisplayName(origin)).toBe(origin)
})

test('provides a safe fallback for absent origin metadata', () => {
  expect(getOriginDisplayName(undefined)).toBe('Unknown origin')
  expect(getOriginDisplayName('')).toBe('Unknown origin')
})
