import Icon from '../../../../../../resources/Components/Icon'
import { toTokenId } from '../../../../../../resources/domain/balance'
import React from 'react'
import Restore from 'react-restore'
import BigNumber from 'bignumber.js'

import link from '../../../../../../resources/link'
import {
  ClusterBox,
  Cluster,
  ClusterRow,
  ClusterStatus,
  ClusterValue
} from '../../../../../../resources/Components/Cluster'
import AddressIdentity from '../../../../../../resources/Components/AddressIdentity'
import AddressSafetyStatus, {
  addressSafetyTarget
} from '../../../../../../resources/Components/AddressSafetyStatus'
import { resolveLocalAddressIdentity } from '../../../../../../resources/domain/addressBook/identity'
import { isUnlimited } from '../../../../../../resources/utils/numbers'
import { DisplayValue, DisplayCoinBalance } from '../../../../../../resources/Components/DisplayValue'
import { getAddress } from '../../../../../../resources/utils'

export class TxSending extends React.Component {
  constructor(...args) {
    super(...args)
    this.state = {
      copied: false
    }
  }
  copyAddress(data) {
    link.send('tray:clipboardData', data)
    this.setState({ copied: true })
    clearTimeout(this.copyTimer)
    this.copyTimer = setTimeout(() => this.setState({ copied: false }), 1000)
  }
  componentWillUnmount() {
    clearTimeout(this.copyTimer)
  }
  render() {
    const req = this.props.req
    const contract = req.data.to.toLowerCase()
    const chainId = parseInt(req.data.chainId, 16)
    const chainName = this.store('main.networks.ethereum', chainId, 'name')

    const { action } = this.props
    const [actionClass, actionType] = action.id.split(':')

    if (actionClass === 'erc20') {
      if (actionType === 'transfer') {
        const {
          amount,
          decimals,
          name,
          recipient: { address: recipientAddress, type: recipientType, ens: recipientEns },
          symbol
        } = action.data || {}
        const address = getAddress(recipientAddress)
        const distinctSafetyTarget =
          typeof address === 'string' && address.toLowerCase() !== req.data.to?.toLowerCase()
        const localIdentity = resolveLocalAddressIdentity(
          this.store('main.addressBook'),
          this.store('main.accounts'),
          address
        )

        const isTestnet = this.store('main.networks', this.props.chain.type, this.props.chain.id, 'isTestnet')
        const rate = this.store('main.rates', toTokenId({ chainId, address: contract }))

        return (
          <ClusterBox title={`Sending ${symbol}`} subtitle={name} animationSlot={this.props.i}>
            <Cluster>
              {!this.props.compact ? (
                <ClusterRow>
                  <ClusterValue grow={2}>
                    <div className='txSendingValue'>
                      <DisplayCoinBalance amount={amount} decimals={decimals} symbol={symbol} />
                    </div>
                  </ClusterValue>
                  <ClusterValue>
                    <span className='_txMainTransferringEq'>{isTestnet ? '=' : '≈'}</span>
                    <DisplayValue
                      type='fiat'
                      value={amount}
                      valueDataParams={{ currencyRate: rate && rate.usd, isTestnet, decimals }}
                      currencySymbol='$'
                    />
                  </ClusterValue>
                </ClusterRow>
              ) : null}
              {!this.props.compact && address && recipientType === 'contract' ? (
                <ClusterRow>
                  <ClusterValue>
                    <div className='clusterTag'>{`to contract on ${chainName}`}</div>
                  </ClusterValue>
                </ClusterRow>
              ) : !this.props.compact && address ? (
                <ClusterRow>
                  <ClusterValue>
                    <div className='clusterTag'>{`to account on ${chainName}`}</div>
                  </ClusterValue>
                </ClusterRow>
              ) : null}

              {address && (
                <ClusterRow>
                  <ClusterValue
                    ariaLabel='Copy token transfer recipient address'
                    pointerEvents={true}
                    onClick={() => {
                      this.copyAddress(address)
                    }}
                  >
                    <div className='clusterAddress'>
                      <AddressIdentity
                        address={address}
                        complete={true}
                        copied={this.state.copied}
                        emphasizeEnds={addressSafetyTarget(req.addressSafety, address)?.state === 'lookalike'}
                        label={localIdentity?.label || recipientEns}
                        revealOnHover={false}
                        source={localIdentity?.source || (recipientEns ? 'ENS' : '')}
                      />
                      {distinctSafetyTarget ? (
                        <AddressSafetyStatus address={address} assessment={req.addressSafety} />
                      ) : null}
                    </div>
                  </ClusterValue>
                  <ClusterStatus>
                    {this.state.copied ? 'Transfer recipient address copied' : ''}
                  </ClusterStatus>
                </ClusterRow>
              )}
            </Cluster>
          </ClusterBox>
        )
      } else if (actionType === 'approve') {
        const {
          amount,
          decimals,
          spender: { address: recipientAddress, ens: spenderEns, contractName, contractSource },
          symbol
        } = action.data || {}
        const address = recipientAddress
        const distinctSafetyTarget =
          typeof address === 'string' && address.toLowerCase() !== req.data.to?.toLowerCase()
        const localIdentity = resolveLocalAddressIdentity(
          this.store('main.addressBook'),
          this.store('main.accounts'),
          address
        )
        const value = new BigNumber(amount)
        const revoke = value.eq(0)
        const displayAmount = isUnlimited(amount) ? 'Unlimited' : value.shiftedBy(-decimals).toFixed()
        const isSubmitted = req.status !== undefined || this.props.readOnly

        return (
          <ClusterBox
            title={'Token approval'}
            className='transactionReviewTokenApproval'
            animationSlot={this.props.i}
          >
            <Cluster>
              <ClusterRow>
                <ClusterValue
                  ariaLabel={!isSubmitted ? `Edit ${symbol} approval` : undefined}
                  onClick={
                    !isSubmitted
                      ? () => {
                          link.send('nav:update', 'panel', {
                            data: {
                              step: 'adjustApproval',
                              actionId: action.id,
                              requestedAmountHex: amount
                            }
                          })
                        }
                      : undefined
                  }
                  style={isSubmitted ? { cursor: 'auto' } : {}}
                >
                  <div className='transactionReviewApprovalLimit'>
                    <span className='transactionReviewMetaLabel'>Spend limit</span>
                    <strong>{revoke ? `Revoke ${symbol}` : `${displayAmount} ${symbol}`}</strong>
                    {!isSubmitted ? (
                      <span className='transactionReviewApprovalAdjust' aria-hidden='true'>
                        Adjust
                      </span>
                    ) : null}
                  </div>
                </ClusterValue>
              </ClusterRow>
              {address && (
                <ClusterRow>
                  <ClusterValue
                    ariaLabel='Copy token approval spender address'
                    pointerEvents={true}
                    onClick={() => {
                      this.copyAddress(address)
                    }}
                  >
                    <div className='transactionReviewApprovalSpender'>
                      <span className='transactionReviewMetaLabel'>Spender</span>
                      <div className='clusterAddress'>
                        <AddressIdentity
                          address={address}
                          complete={true}
                          copied={this.state.copied}
                          emphasizeEnds={
                            addressSafetyTarget(req.addressSafety, address)?.state === 'lookalike'
                          }
                          label={localIdentity?.label || contractName || spenderEns}
                          revealOnHover={false}
                          source={
                            localIdentity?.source || (contractName ? contractSource : spenderEns ? 'ENS' : '')
                          }
                        />
                        <span className='signingReviewCopyIcon'>
                          <Icon name='copy' size={16} />
                        </span>
                        {distinctSafetyTarget ? (
                          <AddressSafetyStatus address={address} assessment={req.addressSafety} />
                        ) : null}
                      </div>
                    </div>
                  </ClusterValue>
                  <ClusterStatus>{this.state.copied ? 'Approval spender address copied' : ''}</ClusterStatus>
                </ClusterRow>
              )}
            </Cluster>
          </ClusterBox>
        )
      }
    }
  }
}

export default Restore.connect(TxSending)
