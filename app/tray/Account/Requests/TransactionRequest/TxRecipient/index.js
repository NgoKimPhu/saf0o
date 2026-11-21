import Icon from '../../../../../../resources/Components/Icon'
import React from 'react'
import Restore from 'react-restore'

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
import AddressReputation from '../../../../../../resources/Components/AddressReputation'
import { resolveLocalAddressIdentity } from '../../../../../../resources/domain/addressBook/identity'
import { getAddress } from '../../../../../../resources/utils'

class TxRecipient extends React.Component {
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
    const address = req.data.to ? getAddress(req.data.to) : ''
    if (!address) return null

    const ensName = req.recipient && req.recipient.length < 25 ? req.recipient : ''
    const localIdentity = address
      ? resolveLocalAddressIdentity(this.store('main.addressBook'), this.store('main.accounts'), address)
      : undefined
    const addressSafety = addressSafetyTarget(req.addressSafety, address)
    const tokenAction = (req.recognizedActions || []).some(
      (action) => action.id === 'erc20:approve' || action.id === 'erc20:transfer'
    )
    const title = req.recipientType === 'contract' ? 'Calling Contract' : 'Recipient Account'
    return (
      <ClusterBox className='transactionReviewRecipient' title={title} animationSlot={this.props.i}>
        <Cluster>
          <ClusterRow>
            <ClusterValue
              ariaLabel='Copy transaction recipient address'
              pointerEvents={true}
              onClick={() => {
                this.copyAddress(address)
              }}
            >
              <span className='transactionReviewMetaLabel transactionReviewRecipientLabel'>
                {tokenAction ? 'Token contract' : req.recipientType === 'contract' ? 'Contract' : 'To'}
              </span>
              <div className='clusterAddress'>
                <AddressIdentity
                  address={address}
                  complete={true}
                  emphasizeEnds={addressSafety?.state === 'lookalike'}
                  label={localIdentity?.label || ensName}
                  revealOnHover={false}
                  source={localIdentity?.source || (ensName ? 'ENS' : '')}
                />
                <span className='signingReviewCopyIcon'>
                  <Icon name='copy' size={16} />
                </span>
                <AddressSafetyStatus address={address} assessment={req.addressSafety} />
                <AddressReputation address={address} reputation={req.reputation} />
              </div>
              <span
                aria-hidden='true'
                className={`transactionReviewCopyFeedback${this.state.copied ? ' transactionReviewCopyFeedbackVisible' : ''}`}
              >
                Address copied
              </span>
            </ClusterValue>
            <ClusterStatus>{this.state.copied ? 'Transaction recipient address copied' : ''}</ClusterStatus>
          </ClusterRow>

          {this.props.technical && req.decodedData && req.decodedData.method ? (
            <ClusterRow>
              <ClusterValue>
                <span className={'clusterTag'} style={{ color: 'var(--good)', fontSize: '16px' }}>
                  {(() => {
                    if (req.decodedData.method.length > 17) return `${req.decodedData.method.substr(0, 15)}..`
                    return req.decodedData.method
                  })()}
                </span>
              </ClusterValue>
            </ClusterRow>
          ) : this.props.technical && req.recipientType === 'contract' ? (
            <ClusterRow>
              <ClusterValue>
                <div className='clusterTag'>
                  {req.calldataDecodeStatus === 'pending'
                    ? 'Identifying contract method…'
                    : 'Contract method not decoded'}
                </div>
              </ClusterValue>
            </ClusterRow>
          ) : null}
          {this.props.technical && req.decodedData && req.decodedData.source && (
            <ClusterRow>
              <ClusterValue>
                <div className='clusterTag'>{'abi source: ' + req.decodedData.source}</div>
              </ClusterValue>
            </ClusterRow>
          )}
        </Cluster>
      </ClusterBox>
    )
  }
}

export default Restore.connect(TxRecipient)
