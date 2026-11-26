import React from 'react'

import { act, render, screen } from '../../../componentSetup'
import {
  connectedNetworks,
  DelegationRevocation,
  delegationRevocationCopy,
  signsDelegation
} from '../../../../app/dash/Accounts/DelegationRevocation'
import link from '../../../../resources/link'

jest.mock('../../../../resources/link', () => ({ rpc: jest.fn(), send: jest.fn() }))

const account = '0x0000000000000000000000000000000000000001'
const delegate = '0x0000000000000000000000000000000000000002'
const signer = { id: 'local-signer', type: 'ring' }
const accounts = {
  [account]: { id: account, address: account, name: 'Workshop', signer: signer.id, lastSignerType: 'ring' }
}
const networks = {
  1: {
    id: 1,
    name: 'Ethereum',
    on: true,
    connection: { endpoints: [{ connected: true }] }
  },
  10: {
    id: 10,
    name: 'Offline',
    on: true,
    connection: { endpoints: [{ connected: false }] }
  }
}

beforeEach(() => {
  link.rpc.mockReset()
  link.send.mockReset()
})

// Trezor firmware 2.12.5+ signs the revoke tx, so Trezor accounts get the revoke action too.
it('recognizes accounts whose signer can sign a delegation, and connected enabled networks', () => {
  expect(signsDelegation(accounts[account], { [signer.id]: signer })).toBe(true)
  expect(signsDelegation({ ...accounts[account], lastSignerType: 'trezor', signer: undefined })).toBe(true)
  expect(signsDelegation({ ...accounts[account], lastSignerType: 'ledger', signer: undefined })).toBe(false)
  expect(connectedNetworks(networks)).toEqual([{ id: 1, name: 'Ethereum' }])
})

it('checks the selected software account and queues only an eligible revocation', async () => {
  link.rpc.mockImplementation((method, ...args) => {
    const callback = args.at(-1)
    if (method === 'getAccountExecutionState') {
      callback(null, {
        status: 'delegated',
        account,
        chainId: 1,
        source: 'eth_getCode',
        delegate,
        codeHash: `0x${'11'.repeat(32)}`
      })
    } else if (method === 'getEip7702RevocationEligibility') {
      callback(null, {
        status: 'eligible',
        account,
        chainId: 1,
        source: 'eth_getCode',
        delegate,
        codeHash: `0x${'11'.repeat(32)}`
      })
    } else if (method === 'requestEip7702Revocation') {
      callback(null, { type: 'eip7702Revoke', account, handlerId: 'revoke-1' })
    }
  })

  const { user } = render(
    <DelegationRevocation
      accounts={accounts}
      currentAccount={account}
      networks={networks}
      signers={{ [signer.id]: signer }}
    />
  )

  expect(await screen.findByText('Reported by configured RPC · eth_getCode')).toBeTruthy()
  expect(screen.getByText(delegate)).toBeTruthy()
  expect(link.rpc).toHaveBeenCalledWith('getAccountExecutionState', account, 1, expect.any(Function))

  await user.click(screen.getByRole('button', { name: 'Revoke delegation' }))
  expect(link.rpc).toHaveBeenCalledWith('requestEip7702Revocation', account, 1, expect.any(Function))
  expect(link.send).toHaveBeenCalledWith('tray:action', 'closeDash')
  expect(link.send).toHaveBeenCalledWith('nav:forward', 'panel', {
    view: 'requestView',
    data: { step: 'confirm', accountId: account, requestId: 'revoke-1' }
  })
})

// A revoke leaves Ambire storage in place, so an active key would regain control on re-delegation.
it('holds the revoke back while an Ambire key is active', async () => {
  const evidence = { account, chainId: 1, source: 'eth_getCode', delegate, codeHash: `0x${'11'.repeat(32)}` }
  link.rpc.mockImplementation((method, ...args) => {
    const callback = args.at(-1)
    if (method === 'getAccountExecutionState') callback(null, { status: 'delegated', ...evidence })
    if (method === 'getEip7702RevocationEligibility') callback(null, { status: 'eligible', ...evidence })
    if (method === 'getAmbireKeys') {
      callback(null, {
        account,
        chainId: 1,
        supported: true,
        keys: [{ address: delegate, privilege: `0x${'0'.repeat(63)}1` }]
      })
    }
  })

  render(
    <DelegationRevocation
      accounts={accounts}
      currentAccount={account}
      networks={networks}
      signers={{ [signer.id]: signer }}
    />
  )

  expect(await screen.findByRole('button', { name: 'Clear all keys' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Revoke delegation' })).toBeNull()
})

// An incomplete key history warns but keeps the revoke available: main asks for native confirmation.
it('keeps the revoke available while the Ambire key history is incomplete', async () => {
  const evidence = { account, chainId: 1, source: 'eth_getCode', delegate, codeHash: `0x${'11'.repeat(32)}` }
  link.rpc.mockImplementation((method, ...args) => {
    const callback = args.at(-1)
    if (method === 'getAccountExecutionState') callback(null, { status: 'delegated', ...evidence })
    if (method === 'getEip7702RevocationEligibility') callback(null, { status: 'eligible', ...evidence })
    if (method === 'getAmbireKeys') {
      callback(null, { account, chainId: 1, supported: true, discovery: 'incomplete', keys: [] })
    }
  })

  render(
    <DelegationRevocation
      accounts={accounts}
      currentAccount={account}
      networks={networks}
      signers={{ [signer.id]: signer }}
    />
  )

  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(await screen.findByRole('button', { name: 'Revoke delegation' })).toBeTruthy()
})

it('observes a different account without changing Saf0o selection', async () => {
  const current = '0x0000000000000000000000000000000000000003'
  const multipleAccounts = {
    ...accounts,
    [current]: { id: current, address: current, name: 'Current', lastSignerType: 'ring' }
  }
  link.rpc.mockImplementation((method, ...args) => {
    const callback = args.at(-1)
    if (method === 'getAccountExecutionState') {
      callback(null, {
        status: 'no-code',
        account: args[0],
        chainId: 1,
        source: 'eth_getCode',
        codeHash: `0x${'c5'.repeat(32)}`
      })
    }
  })

  const { user } = render(
    <DelegationRevocation
      accounts={multipleAccounts}
      currentAccount={current}
      networks={networks}
      signers={{ [signer.id]: signer }}
    />
  )

  await user.selectOptions(screen.getByLabelText('Account to observe'), account)

  expect(link.rpc).not.toHaveBeenCalledWith('setSigner', account, expect.any(Function))
  expect(link.rpc).toHaveBeenCalledWith('getAccountExecutionState', account, 1, expect.any(Function))
  expect(await screen.findByText(delegationRevocationCopy.none)).toBeTruthy()
})

it('shows delegated hardware evidence without offering revocation', async () => {
  link.rpc.mockImplementation((method, selectedAccount, chainId, callback) => {
    if (method === 'getAccountExecutionState') {
      callback(null, {
        status: 'delegated',
        account: selectedAccount,
        chainId,
        source: 'eth_getCode',
        delegate,
        codeHash: `0x${'11'.repeat(32)}`
      })
    }
  })
  render(
    <DelegationRevocation
      accounts={{ [account]: { ...accounts[account], signer: undefined, lastSignerType: 'ledger' } }}
      currentAccount={account}
      networks={networks}
      signers={{}}
    />
  )

  expect(await screen.findByText(delegate)).toBeTruthy()
  expect(screen.getByText(delegationRevocationCopy.hardware)).toBeTruthy()
  expect(document.body.textContent).not.toContain('Request not sent')
  expect(screen.queryByRole('button', { name: 'Revoke delegation' })).toBeNull()
  expect(link.rpc).toHaveBeenCalledWith('getAccountExecutionState', account, 1, expect.any(Function))
  expect(link.rpc.mock.calls.some(([method]) => method === 'getEip7702RevocationEligibility')).toBe(false)
})

it('rechecks eligibility when the selected network reconnects', async () => {
  link.rpc.mockImplementation((method, selectedAccount, chainId, callback) => {
    if (method === 'getAccountExecutionState') {
      callback(null, {
        status: 'delegated',
        account: selectedAccount,
        chainId,
        source: 'eth_getCode',
        delegate,
        codeHash: `0x${'11'.repeat(32)}`
      })
    }
  })
  const props = {
    accounts,
    currentAccount: account,
    signers: { [signer.id]: signer }
  }
  const { rerender } = render(<DelegationRevocation {...props} networks={networks} />)

  expect(await screen.findByText(delegate)).toBeTruthy()
  const disconnected = {
    ...networks,
    1: { ...networks[1], connection: { endpoints: [{ connected: false }] } }
  }
  rerender(<DelegationRevocation {...props} networks={disconnected} />)
  expect(await screen.findByText(delegationRevocationCopy.unavailable)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Revoke delegation' })).toBeNull()

  const reconnected = {
    ...networks,
    1: { ...networks[1], connection: { endpoints: [{ connected: true }] } }
  }
  rerender(<DelegationRevocation {...props} networks={reconnected} />)
  expect(await screen.findByText(delegate)).toBeTruthy()
  expect(link.rpc.mock.calls.filter(([method]) => method === 'getAccountExecutionState')).toHaveLength(2)
})

it('ignores stale eligibility results when the network changes', async () => {
  const callbacks = new Map()
  link.rpc.mockImplementation((method, _account, chainId, callback) => {
    if (method === 'getAccountExecutionState') callbacks.set(chainId, callback)
  })
  const withPolygon = {
    ...networks,
    137: {
      id: 137,
      name: 'Polygon',
      on: true,
      connection: { endpoints: [{ connected: true }] }
    }
  }
  const ref = React.createRef()
  render(
    <DelegationRevocation
      ref={ref}
      accounts={accounts}
      currentAccount={account}
      networks={withPolygon}
      signers={{ [signer.id]: signer }}
    />
  )

  act(() => ref.current.checkExecution(account, 137))
  act(() => {
    callbacks.get(137)(null, {
      status: 'delegated',
      account,
      chainId: 137,
      source: 'eth_getCode',
      delegate,
      codeHash: `0x${'22'.repeat(32)}`
    })
  })
  expect(await screen.findByText(delegate)).toBeTruthy()

  act(() =>
    callbacks.get(1)(null, {
      status: 'no-code',
      account,
      chainId: 1,
      source: 'eth_getCode',
      codeHash: `0x${'c5'.repeat(32)}`
    })
  )
  expect(screen.getByText(delegate)).toBeTruthy()
  expect(screen.queryByText(delegationRevocationCopy.none)).toBeNull()
})

it('recovers with bounded copy when request admission fails', async () => {
  link.rpc.mockImplementation((method, ...args) => {
    const callback = args.at(-1)
    if (method === 'getAccountExecutionState') {
      callback(null, {
        status: 'delegated',
        account,
        chainId: 1,
        source: 'eth_getCode',
        delegate,
        codeHash: `0x${'11'.repeat(32)}`
      })
    } else if (method === 'getEip7702RevocationEligibility') {
      callback(null, {
        status: 'eligible',
        account,
        chainId: 1,
        delegate,
        codeHash: `0x${'11'.repeat(32)}`
      })
    } else if (method === 'requestEip7702Revocation') {
      callback(new Error('admission failed'))
    }
  })
  const { user } = render(
    <DelegationRevocation
      accounts={accounts}
      currentAccount={account}
      networks={networks}
      signers={{ [signer.id]: signer }}
    />
  )

  await user.click(await screen.findByRole('button', { name: 'Revoke delegation' }))

  expect(await screen.findByText(delegationRevocationCopy.admissionFailed)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Revoke delegation' })).toBeNull()
  expect(link.send).not.toHaveBeenCalled()
})

// wallet_sendCalls cannot upgrade a Trezor account (the firmware cannot sign upgrade plus batch),
// so the dash is the upgrade path. A software account must not get this action.
it('offers a codeless Trezor account the upgrade and queues it through main', async () => {
  const ambire = '0x5a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d'
  const trezor = { id: 'trezor-signer', type: 'trezor' }
  link.rpc.mockImplementation((method, ...args) => {
    const callback = args.at(-1)
    const base = { account, chainId: 1, source: 'eth_getCode' }
    if (method === 'getAccountExecutionState') {
      callback(null, { ...base, status: 'no-code', codeHash: `0x${'22'.repeat(32)}` })
    } else if (method === 'getEip7702UpgradeEligibility') {
      callback(null, { ...base, status: 'eligible', delegate: ambire, codeHash: `0x${'33'.repeat(32)}` })
    } else if (method === 'requestEip7702Upgrade') {
      callback(null, { type: 'eip7702Revoke', account, handlerId: 'upgrade-1' })
    }
  })

  const { user } = render(
    <DelegationRevocation
      accounts={{ [account]: { ...accounts[account], signer: trezor.id, lastSignerType: 'trezor' } }}
      currentAccount={account}
      networks={networks}
      signers={{ [trezor.id]: trezor }}
    />
  )

  await user.click(await screen.findByRole('button', { name: 'Upgrade to smart account' }))
  expect(link.rpc).toHaveBeenCalledWith('requestEip7702Upgrade', account, 1, expect.any(Function))
  expect(link.send).toHaveBeenCalledWith('nav:forward', 'panel', {
    view: 'requestView',
    data: { step: 'confirm', accountId: account, requestId: 'upgrade-1' }
  })
})

it('does not offer the upgrade to a codeless software account', async () => {
  link.rpc.mockImplementation((method, ...args) => {
    if (method === 'getAccountExecutionState') {
      args.at(-1)(null, {
        account,
        chainId: 1,
        source: 'eth_getCode',
        status: 'no-code',
        codeHash: `0x${'22'.repeat(32)}`
      })
    }
  })

  render(
    <DelegationRevocation
      accounts={accounts}
      currentAccount={account}
      networks={networks}
      signers={{ [signer.id]: signer }}
    />
  )

  expect(await screen.findByText(delegationRevocationCopy.none)).toBeTruthy()
  expect(link.rpc).not.toHaveBeenCalledWith('getEip7702UpgradeEligibility', account, 1, expect.any(Function))
})
