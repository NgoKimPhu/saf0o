import { Component, createRef } from 'react'
import Restore from 'react-restore'
import { createPortal } from 'react-dom'

import { SAF0O_LICENSE_URL } from '../../../resources/constants'
import link from '../../../resources/link'
import Dropdown from '../../../resources/Components/Dropdown'
import KeyboardShortcutConfigurator from '../../../resources/Components/KeyboardShortcutConfigurator'
import Toggle from '../../../resources/Components/Toggle'
import DialogSurface from '../../../resources/Components/DialogSurface'
import Recovery from './Recovery'
import SignerProtection from './SignerProtection'
import ContractVerificationCredential from './ContractVerificationCredential'

import styled from 'styled-components'
import { normalizeWindowTransparency } from '../../../resources/domain/windowTransparency'

const EditShortcut = styled.button`
  flex: none;
  min-height: 44px;
  min-width: 48px;
  padding: 0 8px;
  font-size: 12px;
`

const CompanionDetails = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`

const CompanionIdentity = styled.div`
  color: var(--moon);
  font-family: 'FiraCode';
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RevokeCompanion = styled.button`
  flex: none;
  min-height: 44px;
  font-size: 12px;
  margin-left: 16px;
`

const CompanionRevokeDialog = styled.div`
  margin-top: 12px;
  padding: 14px 16px 16px;
  border: 1px solid var(--saf0o-border-subtle);
  border-radius: var(--saf0o-radius-sm);
  background: var(--saf0o-bg-elevated);
`

const CompanionRevokeTitle = styled.h3`
  margin: 0;
  color: var(--saf0o-text-primary);
  font-family: var(--saf0o-font-ui);
  font-size: var(--saf0o-type-body);
  font-weight: 600;
  line-height: 20px;
`

const CompanionRevokeBody = styled.p`
  margin: 6px 0 0;
  color: var(--saf0o-text-secondary);
  font-family: var(--saf0o-font-ui);
  font-size: var(--saf0o-type-small);
  line-height: 18px;
`

const CompanionRevokeError = styled.div`
  margin-top: 8px;
  color: var(--saf0o-danger);
  font-family: var(--saf0o-font-ui);
  font-size: var(--saf0o-type-small);
  line-height: 18px;
`

const CompanionRevokeActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: var(--saf0o-space-2);
  margin-top: 12px;

  button {
    min-height: 44px;
    font-size: 12px;
  }
`

const RecentRecipientsDialog = ({ children, ...props }) =>
  createPortal(
    <div className='recentRecipientsOverlay'>
      <DialogSurface {...props} as={CompanionRevokeDialog} className='recentRecipientsDialog' modal>
        {children}
      </DialogSurface>
    </div>,
    document.body
  )

const RecentRecipientActions = styled.div`
  display: flex;
  align-items: center;
  gap: var(--saf0o-space-3);

  button {
    min-height: 44px;
    font-size: 12px;
  }
`

export class Settings extends Component {
  constructor(props, context) {
    super(props, context)
    const latticeEndpoint = context.store('main.latticeSettings.endpointCustom')
    const latticeEndpointMode = context.store('main.latticeSettings.endpointMode')
    this.revokeCancelRef = createRef()
    this.revokeTriggerRefs = {}
    this.revokeNativeCancelRef = createRef()
    this.revokeNativeTriggerRefs = {}
    this.resetTriggerRef = createRef()
    this.resetCancelRef = createRef()
    this.recentDisableTriggerRef = createRef()
    this.recentDisableCancelRef = createRef()
    this.recentClearTriggerRef = createRef()
    this.recentClearCancelRef = createRef()
    this.state = {
      category: props.data?.category || 'general',
      latticeEndpoint,
      latticeEndpointMode,
      resetConfirm: false,
      instanceIdCopied: false,
      revokeCompanionConfirm: undefined,
      revokeCompanionPending: false,
      revokeCompanionError: '',
      revokeNativeConfirm: undefined,
      revokeNativePending: false,
      revokeNativeError: '',
      recentDisableConfirm: false,
      recentClearConfirm: false,
      recentPrivacyPending: false,
      recentStatus: ''
    }
  }

  componentDidMount() {
    this.mounted = true
  }

  componentWillUnmount() {
    this.mounted = false
    clearTimeout(this.instanceIdCopiedTimeout)
    clearTimeout(this.inputLatticeTimeout)
  }

  setRecentRecipients(enabled) {
    if (enabled) {
      link.send('tray:action', 'setRememberRecentRecipients', true)
      this.setState({ recentDisableConfirm: false, recentClearConfirm: false, recentStatus: '' })
      return
    }
    this.recentDisableTriggerRef.current = document.activeElement
    this.setState({ recentDisableConfirm: true, recentClearConfirm: false, recentStatus: '' }, () =>
      this.recentDisableCancelRef.current?.focus()
    )
  }

  cancelRecentDisable() {
    if (this.state.recentPrivacyPending) return
    this.setState({ recentDisableConfirm: false }, () => this.recentDisableTriggerRef.current?.focus())
  }

  async confirmRecentDisable() {
    if (this.state.recentPrivacyPending) return
    this.setState({ recentPrivacyPending: true })
    let durable = false
    let sessionOnly = false
    try {
      const result = await link.invoke('settings:clearRecentRecipients', 'disable')
      durable = result?.success === true && result.durable === true
      sessionOnly = result?.success === false && result.sessionOnly === true
    } catch {
      durable = false
    }
    if (!this.mounted) return
    this.setState(
      {
        recentDisableConfirm: false,
        recentClearConfirm: false,
        recentPrivacyPending: false,
        recentStatus: durable
          ? 'Recent recipients turned off and cleared from this device'
          : sessionOnly
            ? 'Recent recipients are off for this session, but Saf0o could not confirm the clearing was saved. Restart may restore prior data.'
            : 'Saf0o could not confirm that recent recipients were turned off or cleared. Try again.'
      },
      () => this.recentDisableTriggerRef.current?.focus()
    )
  }

  armRecentClear() {
    this.setState({ recentClearConfirm: true, recentDisableConfirm: false, recentStatus: '' }, () =>
      this.recentClearCancelRef.current?.focus()
    )
  }

  cancelRecentClear() {
    if (this.state.recentPrivacyPending) return
    this.setState({ recentClearConfirm: false }, () => this.recentClearTriggerRef.current?.focus())
  }

  async confirmRecentClear() {
    if (this.state.recentPrivacyPending) return
    this.setState({ recentPrivacyPending: true })
    let durable = false
    let sessionOnly = false
    try {
      const result = await link.invoke('settings:clearRecentRecipients', 'clear')
      durable = result?.success === true && result.durable === true
      sessionOnly = result?.success === false && result.sessionOnly === true
    } catch {
      durable = false
    }
    if (!this.mounted) return
    this.setState(
      {
        recentClearConfirm: false,
        recentPrivacyPending: false,
        recentStatus: durable
          ? 'Recent recipients cleared from this device'
          : sessionOnly
            ? 'Recent recipients are cleared for this session, but Saf0o could not confirm the clearing was saved. Restart may restore prior data.'
            : 'Saf0o could not confirm that recent recipients were cleared. Try again.'
      },
      () => this.recentClearTriggerRef.current?.focus()
    )
  }

  appInfo() {
    const appVersion = this.store('version')
    const instanceId = this.store('main.instanceId')
    return (
      <div className='appInfo'>
        <button
          type='button'
          className='appInfoLine appInfoLineInstanceId'
          onMouseLeave={(event) => {
            event.stopPropagation()
            event.preventDefault()
            this.setState({ instanceIdCopied: false })
          }}
          onClick={() => {
            clearTimeout(this.instanceIdCopiedTimeout)
            link.send('tray:clipboardData', instanceId)
            this.setState({ instanceIdCopied: true })
            this.instanceIdCopiedTimeout = setTimeout(() => this.setState({ instanceIdCopied: false }), 1800)
          }}
        >
          {this.state.instanceIdCopied ? (
            <span className='instanceIdCopied'>{'Instance ID Copied'}</span>
          ) : (
            instanceId
          )}
        </button>
        <div className='appInfoLine appInfoLineVersion'>{`v${appVersion}`}</div>
        <button
          type='button'
          className='appInfoViewLicense'
          onClick={() => link.send('tray:openExternal', SAF0O_LICENSE_URL)}
        >
          View License
        </button>
        <div className='appInfoLine appInfoLineReset'>
          {this.state.resetConfirm ? (
            <DialogSurface
              className='appInfoLineResetConfirm'
              role='alertdialog'
              modal={false}
              labelledBy='reset-app-title'
              initialFocusRef={this.resetCancelRef}
              returnFocusRef={this.resetTriggerRef}
              onCancel={() => this.setState({ resetConfirm: false })}
            >
              <strong id='reset-app-title'>Reset Saf0o?</strong>
              <span>
                This removes local accounts, signers, networks, contacts, recent recipients, custom tokens,
                permissions, and settings from this device. This cannot be undone.
              </span>
              <span className='appInfoLineResetConfirmButtons'>
                <button
                  type='button'
                  ref={this.resetCancelRef}
                  className='saf0oControl saf0oControlSecondary'
                  onClick={() =>
                    this.setState({ resetConfirm: false }, () => this.resetTriggerRef.current?.focus())
                  }
                >
                  Cancel
                </button>
                <button
                  type='button'
                  className='saf0oControl saf0oControlDanger'
                  onClick={() => link.send('tray:resetAllSettings')}
                >
                  Reset Saf0o
                </button>
              </span>
            </DialogSurface>
          ) : (
            <button
              type='button'
              ref={this.resetTriggerRef}
              className='appInfoLineResetButton'
              onClick={() =>
                this.setState({ resetConfirm: true }, () => this.resetCancelRef.current?.focus())
              }
            >
              Reset Saf0o
            </button>
          )}
        </div>
      </div>
    )
  }

  armCompanionRevocation(credential) {
    if (this.revokeCompanionPending) return
    this.setState(
      {
        revokeCompanionConfirm: credential.fingerprint,
        revokeCompanionPending: false,
        revokeCompanionError: ''
      },
      () => this.revokeCancelRef.current?.focus()
    )
  }

  cancelCompanionRevocation(fingerprint) {
    if (this.revokeCompanionPending) return
    this.setState(
      {
        revokeCompanionConfirm: undefined,
        revokeCompanionPending: false,
        revokeCompanionError: ''
      },
      () => this.revokeTriggerRefs[fingerprint]?.current?.focus()
    )
  }

  revokeCompanion(credential) {
    if (this.revokeCompanionPending || this.state.revokeCompanionPending) return

    this.revokeCompanionPending = true
    this.setState({ revokeCompanionPending: true, revokeCompanionError: '' })
    link.rpc('revokeExtensionCredential', credential.fingerprint, (error) => {
      this.revokeCompanionPending = false
      if (!this.mounted) return

      if (error) {
        this.setState({
          revokeCompanionPending: false,
          revokeCompanionError: 'Couldn\u2019t revoke pairing. The pairing is unchanged. Try again.'
        })
      } else {
        this.setState({
          revokeCompanionConfirm: undefined,
          revokeCompanionPending: false,
          revokeCompanionError: ''
        })
      }
    })
  }

  armNativeRevocation(credential) {
    if (this.state.revokeNativePending) return
    this.setState({ revokeNativeConfirm: credential.fingerprint, revokeNativeError: '' }, () =>
      this.revokeNativeCancelRef.current?.focus()
    )
  }

  cancelNativeRevocation(fingerprint) {
    if (this.state.revokeNativePending) return
    this.setState({ revokeNativeConfirm: undefined, revokeNativeError: '' }, () =>
      this.revokeNativeTriggerRefs[fingerprint]?.current?.focus()
    )
  }

  revokeNative(credential) {
    if (this.state.revokeNativePending) return
    this.setState({ revokeNativePending: true, revokeNativeError: '' })
    link.rpc('revokeNativePeerCredential', credential.fingerprint, (error) => {
      if (!this.mounted) return
      this.setState(
        error
          ? {
              revokeNativePending: false,
              revokeNativeError: 'Couldn\u2019t revoke connection. Try again.'
            }
          : {
              revokeNativeConfirm: undefined,
              revokeNativePending: false,
              revokeNativeError: ''
            }
      )
    })
  }

  inputLatticeEndpoint(e) {
    e.preventDefault()
    clearTimeout(this.inputLatticeTimeout)
    const value = e.target.value.replace(/\s+/g, '')
    this.setState({ latticeEndpoint: value })
    // Lattice relay configuration is global because Saf0o supports one active Lattice adapter.
    this.inputLatticeTimeout = setTimeout(
      () => link.send('tray:action', 'setLatticeEndpointCustom', value),
      1000
    )
  }

  render() {
    const summonShortcut = this.store('main.shortcuts.summon')
    const platform = this.store('platform')
    const requestedInterfaceScale = this.store('main.interfaceScale') || 1
    const windowTransparency = normalizeWindowTransparency(this.store('main.windowTransparency'))
    const effectiveInterfaceScale = this.store('view.interfaceScaleEffective') || requestedInterfaceScale
    const requestedInterfaceScalePercent = Math.round(requestedInterfaceScale * 100)
    const effectiveInterfaceScalePercent = Math.round(effectiveInterfaceScale * 100)
    const interfaceScaleAnnouncement =
      requestedInterfaceScalePercent === effectiveInterfaceScalePercent
        ? `Interface scale set to ${effectiveInterfaceScalePercent}%.`
        : `Interface scale set to ${effectiveInterfaceScalePercent}%. You requested ${requestedInterfaceScalePercent}%, but Saf0o reduced it to fit the available screen space.`
    const companionCredentials = Object.values(this.store('main.extensionCredentials') || {}).sort(
      (left, right) => right.pairedAt - left.pairedAt
    )
    const nativeCredentials = Object.values(this.store('main.nativePeerCredentials') || {}).sort(
      (left, right) => right.pairedAt - left.pairedAt
    )
    return (
      <div className='localSettings saf0oSettings saf0oSettingsPerch'>
        <div className='localSettingsWrap'>
          <nav className='settingsCategories' aria-label='Settings categories'>
            {[
              ['general', 'General'],
              ['privacy', 'Privacy'],
              ['connections', 'Connections'],
              ['security', 'Security'],
              ['advanced', 'Advanced']
            ].map(([id, label]) => (
              <button
                key={id}
                type='button'
                className='saf0oControl saf0oControlGhost'
                aria-pressed={this.state.category === id}
                onClick={() => this.setState({ category: id })}
              >
                {label}
              </button>
            ))}
          </nav>
          <section
            hidden={this.state.category !== 'general'}
            className='saf0oSettingsSection'
            aria-labelledby='saf0o-settings-desktop'
          >
            <h2 id='saf0o-settings-desktop' className='saf0oSettingsSectionTitle'>
              Desktop behavior
            </h2>
            <div className='signerPermission localSetting localSettingShortcut' style={{ zIndex: 214 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting settingsShortcutSetting'>
                  <span>Wallet shortcut</span>
                  {summonShortcut.configuring ? (
                    <EditShortcut
                      type='button'
                      className='saf0oControl saf0oControlGhost saf0oControlLarge'
                      onClick={() => {
                        link.send('tray:action', 'setShortcut', 'summon', {
                          ...summonShortcut,
                          configuring: false
                        })
                      }}
                    >
                      Cancel
                    </EditShortcut>
                  ) : (
                    <EditShortcut
                      type='button'
                      className='saf0oControl saf0oControlGhost saf0oControlLarge'
                      onClick={() => {
                        link.send('tray:action', 'setShortcut', 'summon', {
                          ...summonShortcut,
                          configuring: true
                        })
                      }}
                    >
                      Edit
                    </EditShortcut>
                  )}
                </div>

                <Toggle
                  checked={summonShortcut.enabled}
                  label='Enable wallet shortcut'
                  onChange={(enabled) => {
                    link.send('tray:action', 'setShortcut', 'summon', {
                      ...summonShortcut,
                      enabled
                    })
                  }}
                />
              </div>
              <div className='signerPermissionDetails'>
                <KeyboardShortcutConfigurator
                  actionText='open or dismiss Saf0o'
                  shortcut={summonShortcut}
                  shortcutName='summon'
                  platform={platform}
                />
              </div>
            </div>
            <div className='signerPermission localSetting interfaceScaleSetting' style={{ zIndex: 213 }}>
              <div className='interfaceScaleHeader'>
                <div className='interfaceScaleCopy'>
                  <div id='interface-scale-label' className='signerPermissionSetting'>
                    Interface scale
                  </div>
                  <div className='interfaceScaleDescription'>
                    Makes Saf0o’s window and contents larger when your display has room.
                  </div>
                </div>
                <div className='interfaceScaleOptions' role='group' aria-labelledby='interface-scale-label'>
                  {[
                    { label: '100%', value: 1 },
                    { label: '125%', value: 1.25 },
                    { label: '150%', value: 1.5 }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type='button'
                      className='saf0oControl saf0oControlGhost interfaceScaleOption'
                      aria-pressed={requestedInterfaceScale === option.value}
                      onClick={() => link.send('tray:action', 'setInterfaceScale', option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              {requestedInterfaceScalePercent !== effectiveInterfaceScalePercent ? (
                <div className='interfaceScaleStatus' aria-hidden='true'>
                  {`${requestedInterfaceScalePercent}% requested · using ${effectiveInterfaceScalePercent}% to fit this display`}
                </div>
              ) : null}
              <div className='interfaceScaleAnnouncement' role='status' aria-live='polite' aria-atomic='true'>
                {interfaceScaleAnnouncement}
              </div>
            </div>
            <div className='signerPermission localSetting interfaceScaleSetting' style={{ zIndex: 212 }}>
              <div className='interfaceScaleHeader'>
                <div className='interfaceScaleCopy'>
                  <div id='window-transparency-label' className='signerPermissionSetting'>
                    Window transparency
                  </div>
                  <div className='interfaceScaleDescription'>
                    Fades the window background so your desktop shows through. Text stays solid.
                  </div>
                </div>
                <div className='windowTransparencyControl'>
                  <input
                    type='range'
                    min={0}
                    max={100}
                    step={1}
                    value={windowTransparency}
                    aria-labelledby='window-transparency-label'
                    aria-valuetext={`${windowTransparency}%`}
                    onChange={(e) =>
                      link.send('tray:action', 'setWindowTransparency', Number(e.target.value))
                    }
                  />
                  <output>{`${windowTransparency}%`}</output>
                </div>
              </div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 213 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Auto-hide</div>
                <Toggle
                  checked={this.store('main.autohide')}
                  label='Auto-hide'
                  onChange={(enabled) => link.send('tray:action', 'setAutohide', enabled)}
                />
              </div>
              <div className='signerPermissionDetails'>
                <span>Hide Saf0o when it loses focus.</span>
              </div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 212 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>MetaSleuth labels</div>
                <Toggle
                  checked={this.store('main.metasleuthLabels') !== false}
                  label='MetaSleuth labels'
                  onChange={(on) => link.send('tray:action', 'setMetasleuthLabels', on)}
                />
              </div>
              <div className='signerPermissionDetails'>
                <span>
                  Sends recipient and contract addresses of pending requests to BlockSec (MetaSleuth) to show
                  labels and risk. Unofficial endpoint; may stop working. Your own address is not sent.
                </span>
              </div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 212 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Etherscan reputation lookups</div>
                <Toggle
                  checked={this.store('main.etherscanReputation') !== false}
                  label='Etherscan reputation lookups'
                  onChange={(on) => link.send('tray:action', 'setEtherscanReputation', on)}
                />
              </div>
              <div className='signerPermissionDetails'>
                <span>
                  Sends your address and target addresses to Etherscan to show contract age, source and usage.
                </span>
              </div>
            </div>
            <div
              id='saf0o-settings-wallet-notifications'
              className='signerPermission localSetting localSettingExplained'
              style={{ zIndex: 212 }}
            >
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Wallet activity notifications</div>
                <Toggle
                  checked={this.store('main.transactionNotifications') !== false}
                  label='Wallet activity notifications'
                  onChange={(enabled) => link.send('tray:action', 'setTransactionNotifications', enabled)}
                />
              </div>
              <div className='signerPermissionDetails'>Alerts while hidden. Wallet details stay private.</div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 212 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Run on startup</div>
                <Toggle
                  checked={this.store('main.launch')}
                  label='Run on startup'
                  onChange={() => link.send('tray:action', 'toggleLaunch')}
                />
              </div>
              <div className='signerPermissionDetails'>Start Saf0o when you sign in.</div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 211 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Reveal from screen edge</div>
                <Toggle
                  checked={this.store('main.reveal')}
                  label='Reveal from screen edge'
                  onChange={() => link.send('tray:action', 'toggleReveal')}
                />
              </div>
              <div className='signerPermissionDetails'>{`Show Saf0o when the pointer rests at the display's ${this.store(
                'main.glideSide'
              )} edge.`}</div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 210 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Wallet side</div>
                <Dropdown
                  label='Wallet side'
                  syncValue={this.store('main.glideSide')}
                  onChange={(value) => link.send('tray:action', 'setGlideSide', value)}
                  options={[
                    { text: 'Right', value: 'right' },
                    { text: 'Left', value: 'left' }
                  ]}
                />
              </div>
              <div className='signerPermissionDetails'>
                Choose the display edge that reveals Saf0o and where the wallet appears.
              </div>
            </div>

            {this.store('platform') === 'darwin' ? (
              <div className='signerPermission localSetting' style={{ zIndex: 209 }}>
                <div className='signerPermissionControls'>
                  <div className='signerPermissionSetting'>Display gas in menu bar</div>
                  <Toggle
                    checked={this.store('main.menubarGasPrice')}
                    label='Display gas in menu bar'
                    onChange={(enabled) => link.send('tray:action', 'setMenubarGasPrice', enabled)}
                  />
                </div>
                <div className='signerPermissionDetails'>Show the Ethereum gas price in the menu bar.</div>
              </div>
            ) : null}
          </section>

          <section
            hidden={this.state.category !== 'general'}
            className='saf0oSettingsSection'
            aria-labelledby='saf0o-settings-accounts'
          >
            <h2 id='saf0o-settings-accounts' className='saf0oSettingsSectionTitle'>
              Accounts and signing
            </h2>

            <div className='signerPermission localSetting' style={{ zIndex: 207 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Show account name with ENS</div>
                <Toggle
                  checked={this.store('main.showLocalNameWithENS')}
                  label='Show account name with ENS'
                  onChange={() => link.send('tray:action', 'toggleShowLocalNameWithENS')}
                />
              </div>
              <div className='signerPermissionDetails'>
                {'Show the local account name when ENS resolves.'}
              </div>
            </div>

            <div className='signerPermission localSetting' style={{ zIndex: 205 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Trezor derivation</div>
                <Dropdown
                  label='Trezor derivation'
                  syncValue={this.store('main.trezor.derivation')}
                  onChange={(value) => link.send('tray:action', 'setTrezorDerivation', value)}
                  options={[
                    { text: 'Standard', value: 'standard' },
                    { text: 'Legacy', value: 'legacy' },
                    { text: 'Testnet', value: 'testnet' }
                  ]}
                />
              </div>
              <div className='signerPermissionDetails'>
                {'Choose the derivation path for connected Trezor devices.'}
              </div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 204 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Ledger derivation</div>
                <Dropdown
                  label='Ledger derivation'
                  syncValue={this.store('main.ledger.derivation')}
                  onChange={(value) => link.send('tray:action', 'setLedgerDerivation', value)}
                  options={[
                    { text: 'Live', value: 'live' },
                    { text: 'Legacy', value: 'legacy' },
                    { text: 'Standard', value: 'standard' },
                    { text: 'Testnet', value: 'testnet' }
                  ]}
                />
              </div>
              <div className='signerPermissionDetails'>
                {'Choose the derivation path for connected Ledger devices.'}
              </div>
            </div>
            {this.store('main.ledger.derivation') === 'live' ? (
              <div className='signerPermission localSetting' style={{ zIndex: 203 }}>
                <div className='signerPermissionControls'>
                  <div className='signerPermissionSetting'>Ledger Live accounts</div>
                  <Dropdown
                    label='Ledger Live accounts'
                    syncValue={this.store('main.ledger.liveAccountLimit')}
                    onChange={(value) => link.send('tray:action', 'setLiveAccountLimit', value)}
                    options={[
                      { text: '5', value: 5 },
                      { text: '10', value: 10 },
                      { text: '20', value: 20 },
                      { text: '40', value: 40 }
                    ]}
                  />
                </div>
                <div className='signerPermissionDetails'>Choose how many Ledger Live accounts to derive.</div>
              </div>
            ) : null}
            <div className='signerPermission localSetting' style={{ zIndex: 202 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Lattice derivation</div>
                <Dropdown
                  label='Lattice derivation'
                  syncValue={this.store('main.latticeSettings.derivation')}
                  onChange={(value) => link.send('tray:action', 'setLatticeDerivation', value)}
                  options={[
                    { text: 'Standard', value: 'standard' },
                    { text: 'Legacy', value: 'legacy' },
                    { text: 'Live', value: 'live' }
                  ]}
                />
              </div>
              <div className='signerPermissionDetails'>
                {'Choose the derivation path for connected Lattice devices.'}
              </div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 201 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Lattice accounts</div>
                <Dropdown
                  label='Lattice accounts'
                  syncValue={this.store('main.latticeSettings.accountLimit')}
                  onChange={(value) => link.send('tray:action', 'setLatticeAccountLimit', value)}
                  options={[
                    { text: '5', value: 5 },
                    { text: '10', value: 10 },
                    { text: '20', value: 20 },
                    { text: '40', value: 40 }
                  ]}
                />
              </div>
              <div className='signerPermissionDetails'>Choose how many Lattice accounts to derive.</div>
            </div>
            <div className='signerPermission localSetting' style={{ zIndex: 200 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Lattice relay</div>
                <Dropdown
                  label='Lattice relay'
                  syncValue={this.store('main.latticeSettings.endpointMode')}
                  onChange={(value) => {
                    link.send('tray:action', 'setLatticeEndpointMode', value)
                    this.setState({ latticeEndpointMode: value })
                  }}
                  options={[
                    { text: 'Default', value: 'default' },
                    { text: 'Custom', value: 'custom' }
                  ]}
                />
              </div>
              <div
                className={
                  this.state.latticeEndpointMode === 'custom'
                    ? 'connectionCustomInput connectionCustomInputOn'
                    : 'connectionCustomInput'
                }
              >
                <input
                  className='saf0oInput'
                  disabled={this.state.latticeEndpointMode !== 'custom'}
                  aria-label='Custom Lattice relay'
                  placeholder={'Custom relay'}
                  value={this.state.latticeEndpoint}
                  onChange={(e) => this.inputLatticeEndpoint(e)}
                />
              </div>
            </div>

            <div className='signerPermission localSetting' style={{ zIndex: 199 }}>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Lock hot signers when</div>
                <Dropdown
                  label='Lock hot signers when'
                  syncValue={this.store('main.accountCloseLock')}
                  onChange={(value) => link.send('tray:action', 'setAccountCloseLock', value)}
                  options={[
                    { text: 'Close', value: true },
                    { text: 'Quit', value: false }
                  ]}
                />
              </div>
              <div className='signerPermissionDetails'>Choose when Saf0o relocks hot signers.</div>
            </div>
          </section>

          <section
            hidden={this.state.category !== 'privacy'}
            className='saf0oSettingsSection'
            aria-labelledby='saf0o-settings-privacy'
          >
            <h2 id='saf0o-settings-privacy' className='saf0oSettingsSectionTitle'>
              Privacy
            </h2>
            <div className='signerPermission localSetting localSettingExplained recentRecipientsSetting'>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Recent recipients</div>
                <Toggle
                  checked={this.store('main.rememberRecentRecipients') === true}
                  label='Save recent recipients'
                  onChange={(enabled) => this.setRecentRecipients(enabled)}
                />
              </div>
              <div className='signerPermissionDetails'>
                Remember recipients from successful sends on this device. Excluded from backups.
              </div>
              {this.state.recentDisableConfirm ? (
                <RecentRecipientsDialog
                  role='alertdialog'
                  busy={this.state.recentPrivacyPending}
                  labelledBy='recent-recipients-disable-title'
                  describedBy='recent-recipients-disable-body'
                  initialFocusRef={this.recentDisableCancelRef}
                  returnFocusRef={this.recentDisableTriggerRef}
                  onCancel={() => this.cancelRecentDisable()}
                >
                  <CompanionRevokeTitle id='recent-recipients-disable-title'>
                    Turn off and clear recent recipients?
                  </CompanionRevokeTitle>
                  <CompanionRevokeBody id='recent-recipients-disable-body'>
                    This stops saving recent recipients and removes all stored recipients from this device.
                    This cannot be undone. Saved contacts are not affected.
                  </CompanionRevokeBody>
                  <CompanionRevokeActions>
                    <button
                      type='button'
                      ref={this.recentDisableCancelRef}
                      className='saf0oControl saf0oControlGhost'
                      disabled={this.state.recentPrivacyPending}
                      onClick={() => this.cancelRecentDisable()}
                    >
                      Cancel
                    </button>
                    <button
                      type='button'
                      className='saf0oControl saf0oControlDanger'
                      disabled={this.state.recentPrivacyPending}
                      onClick={() => this.confirmRecentDisable()}
                    >
                      Turn off and clear
                    </button>
                  </CompanionRevokeActions>
                </RecentRecipientsDialog>
              ) : null}
            </div>
            <div className='signerPermission localSetting localSettingExplained recentRecipientsClear'>
              <div className='signerPermissionControls'>
                <div className='signerPermissionSetting'>Clear recent recipients</div>
                <RecentRecipientActions>
                  <button
                    type='button'
                    ref={this.recentClearTriggerRef}
                    className='saf0oControl saf0oControlGhost'
                    disabled={this.store('main.rememberRecentRecipients') !== true}
                    onClick={() => this.armRecentClear()}
                  >
                    Clear
                  </button>
                </RecentRecipientActions>
              </div>
              <div className='signerPermissionDetails'>
                Remove all recent recipients from this device. Saved contacts are not affected.
              </div>
              {this.state.recentClearConfirm ? (
                <RecentRecipientsDialog
                  role='alertdialog'
                  busy={this.state.recentPrivacyPending}
                  labelledBy='recent-recipients-clear-title'
                  describedBy='recent-recipients-clear-body'
                  initialFocusRef={this.recentClearCancelRef}
                  returnFocusRef={this.recentClearTriggerRef}
                  onCancel={() => this.cancelRecentClear()}
                >
                  <CompanionRevokeTitle id='recent-recipients-clear-title'>
                    Clear recent recipients?
                  </CompanionRevokeTitle>
                  <CompanionRevokeBody id='recent-recipients-clear-body'>
                    Remove all recent recipients from this device? This cannot be undone. Saved contacts are
                    not affected.
                  </CompanionRevokeBody>
                  <CompanionRevokeActions>
                    <button
                      type='button'
                      ref={this.recentClearCancelRef}
                      className='saf0oControl saf0oControlGhost'
                      disabled={this.state.recentPrivacyPending}
                      onClick={() => this.cancelRecentClear()}
                    >
                      Cancel
                    </button>
                    <button
                      type='button'
                      className='saf0oControl saf0oControlDanger'
                      disabled={this.state.recentPrivacyPending}
                      onClick={() => this.confirmRecentClear()}
                    >
                      Clear recipients
                    </button>
                  </CompanionRevokeActions>
                </RecentRecipientsDialog>
              ) : null}
            </div>
            <div className='recentRecipientsStatus' role='status' aria-live='polite' aria-atomic='true'>
              {this.state.recentStatus}
            </div>
          </section>

          {companionCredentials.length > 0 ? (
            <section
              hidden={this.state.category !== 'connections'}
              className='saf0oSettingsSection'
              aria-labelledby='saf0o-settings-companions'
            >
              <h2 id='saf0o-settings-companions' className='saf0oSettingsSectionTitle'>
                Browser companions
              </h2>
              {companionCredentials.map((credential, index) => {
                const confirm = this.state.revokeCompanionConfirm === credential.fingerprint
                if (!this.revokeTriggerRefs[credential.fingerprint]) {
                  this.revokeTriggerRefs[credential.fingerprint] = createRef()
                }
                const dialogSuffix = String(credential.fingerprint).replace(/[^a-zA-Z0-9_-]/g, '')
                const titleId = `revoke-companion-title-${dialogSuffix}`
                const bodyId = `revoke-companion-body-${dialogSuffix}`
                return (
                  <div
                    className='signerPermission localSetting'
                    key={credential.fingerprint}
                    style={{ zIndex: 198 - index }}
                  >
                    <div className='signerPermissionControls'>
                      <CompanionDetails>
                        <div className='signerPermissionSetting'>Paired companion</div>
                        <CompanionIdentity>{`Fingerprint: ${credential.fingerprint}`}</CompanionIdentity>
                      </CompanionDetails>
                      {!confirm ? (
                        <RevokeCompanion
                          ref={this.revokeTriggerRefs[credential.fingerprint]}
                          type='button'
                          className='saf0oControl saf0oControlGhost'
                          onClick={() => this.armCompanionRevocation(credential)}
                        >
                          Revoke
                        </RevokeCompanion>
                      ) : null}
                    </div>
                    <div className='signerPermissionDetails'>
                      Remove this pairing. A new code confirmation is required on reconnect.
                    </div>
                    {confirm ? (
                      <DialogSurface
                        as={CompanionRevokeDialog}
                        className='companionRevokeDialog'
                        role='alertdialog'
                        modal={false}
                        labelledBy={titleId}
                        describedBy={bodyId}
                        busy={this.state.revokeCompanionPending}
                        initialFocusRef={this.revokeCancelRef}
                        returnFocusRef={this.revokeTriggerRefs[credential.fingerprint]}
                        onCancel={() => this.cancelCompanionRevocation(credential.fingerprint)}
                      >
                        <CompanionRevokeTitle id={titleId}>Revoke companion pairing?</CompanionRevokeTitle>
                        <CompanionRevokeBody id={bodyId}>
                          This companion will be disconnected from Saf0o immediately. Pairing it again
                          requires a new six-digit code comparison.
                        </CompanionRevokeBody>
                        {this.state.revokeCompanionError ? (
                          <CompanionRevokeError role='alert'>
                            {this.state.revokeCompanionError}
                          </CompanionRevokeError>
                        ) : null}
                        <CompanionRevokeActions>
                          <button
                            type='button'
                            ref={this.revokeCancelRef}
                            className='saf0oControl saf0oControlGhost'
                            disabled={this.state.revokeCompanionPending}
                            onClick={() => this.cancelCompanionRevocation(credential.fingerprint)}
                          >
                            Cancel
                          </button>
                          <button
                            type='button'
                            className='saf0oControl saf0oControlDanger'
                            disabled={this.state.revokeCompanionPending}
                            onClick={() => this.revokeCompanion(credential)}
                          >
                            {this.state.revokeCompanionPending ? 'Revoking pairing\u2026' : 'Revoke pairing'}
                          </button>
                        </CompanionRevokeActions>
                      </DialogSurface>
                    ) : null}
                  </div>
                )
              })}
            </section>
          ) : null}
          {nativeCredentials.length > 0 ? (
            <section
              hidden={this.state.category !== 'connections'}
              className='saf0oSettingsSection'
              aria-labelledby='saf0o-settings-local-connections'
            >
              <h2 id='saf0o-settings-local-connections' className='saf0oSettingsSectionTitle'>
                Local connections
              </h2>
              {nativeCredentials.map((credential, index) => {
                const confirm = this.state.revokeNativeConfirm === credential.fingerprint
                if (!this.revokeNativeTriggerRefs[credential.fingerprint]) {
                  this.revokeNativeTriggerRefs[credential.fingerprint] = createRef()
                }
                const shortId = `${credential.fingerprint.slice(0, 8)}…${credential.fingerprint.slice(-6)}`
                const titleId = `revoke-native-title-${index}`
                const bodyId = `revoke-native-body-${index}`
                return (
                  <div
                    className='signerPermission localSetting localSettingExplained'
                    key={credential.fingerprint}
                  >
                    <div className='signerPermissionControls'>
                      <CompanionDetails>
                        <div className='signerPermissionSetting'>Local app</div>
                        <CompanionIdentity
                          title={credential.fingerprint}
                        >{`Connection ID ${shortId}`}</CompanionIdentity>
                        <button
                          type='button'
                          className='localConnectionTarget saf0oControl saf0oControlGhost'
                          onClick={() => link.send('tray:clipboardData', credential.fingerprint)}
                        >
                          Copy full connection ID
                        </button>
                      </CompanionDetails>
                      {!confirm ? (
                        <RevokeCompanion
                          ref={this.revokeNativeTriggerRefs[credential.fingerprint]}
                          type='button'
                          className='localConnectionTarget saf0oControl saf0oControlGhost'
                          aria-label='Revoke local app'
                          onClick={() => this.armNativeRevocation(credential)}
                        >
                          Revoke
                        </RevokeCompanion>
                      ) : null}
                    </div>
                    <div className='signerPermissionDetails'>Authenticated software on this computer.</div>
                    {confirm ? (
                      <DialogSurface
                        as={CompanionRevokeDialog}
                        className='companionRevokeDialog'
                        role='alertdialog'
                        modal={false}
                        labelledBy={titleId}
                        describedBy={bodyId}
                        busy={this.state.revokeNativePending}
                        initialFocusRef={this.revokeNativeCancelRef}
                        returnFocusRef={this.revokeNativeTriggerRefs[credential.fingerprint]}
                        onCancel={() => this.cancelNativeRevocation(credential.fingerprint)}
                      >
                        <CompanionRevokeTitle id={titleId}>Revoke local connection?</CompanionRevokeTitle>
                        <CompanionRevokeBody id={bodyId}>
                          This disconnects the local app and removes its access, pending requests, and
                          subscriptions. It must pair again with a matching code to reconnect.
                        </CompanionRevokeBody>
                        {this.state.revokeNativeError ? (
                          <CompanionRevokeError role='alert'>
                            {this.state.revokeNativeError}
                          </CompanionRevokeError>
                        ) : null}
                        <CompanionRevokeActions>
                          <button
                            type='button'
                            ref={this.revokeNativeCancelRef}
                            className='saf0oControl saf0oControlGhost'
                            disabled={this.state.revokeNativePending}
                            onClick={() => this.cancelNativeRevocation(credential.fingerprint)}
                          >
                            Cancel
                          </button>
                          <button
                            type='button'
                            className='saf0oControl saf0oControlDanger'
                            disabled={this.state.revokeNativePending}
                            onClick={() => this.revokeNative(credential)}
                          >
                            {this.state.revokeNativePending ? 'Revoking connection\u2026' : 'Confirm revoke'}
                          </button>
                        </CompanionRevokeActions>
                      </DialogSurface>
                    ) : null}
                  </div>
                )
              })}
            </section>
          ) : null}
          <section
            hidden={this.state.category !== 'advanced'}
            className='saf0oSettingsSection'
            aria-labelledby='saf0o-settings-contract-verification'
          >
            <h2 id='saf0o-settings-contract-verification' className='saf0oSettingsSectionTitle'>
              Contract verification
            </h2>
            <ContractVerificationCredential />
          </section>
          <section
            hidden={this.state.category !== 'security'}
            className='saf0oSettingsSection'
            aria-labelledby='saf0o-settings-recovery'
          >
            <h2 id='saf0o-settings-recovery' className='saf0oSettingsSectionTitle'>
              Recovery
            </h2>
            <Recovery />
          </section>
          <section
            hidden={this.state.category !== 'security'}
            className='saf0oSettingsSection'
            aria-labelledby='saf0o-settings-signer-protection'
          >
            <h2 id='saf0o-settings-signer-protection' className='saf0oSettingsSectionTitle'>
              Software signers
            </h2>
            <SignerProtection />
          </section>
          <section
            hidden={this.state.category !== 'general'}
            className='saf0oSettingsSection'
            aria-labelledby='saf0o-settings-about'
          >
            <h2 id='saf0o-settings-about' className='saf0oSettingsSectionTitle'>
              About
            </h2>
            {this.appInfo()}
          </section>
        </div>
      </div>
    )
  }
}

export default Restore.connect(Settings)
