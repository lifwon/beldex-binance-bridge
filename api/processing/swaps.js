/* eslint-disable no-else-return */
import config from 'config';
import { db, SWAP_TYPE } from '../utils';
import { bnb, loki } from '../helpers';

/**
 * Process any pending swaps and send out the coins.
 *
 * @param {string} swapType The type of swap.
 */
export async function processSwaps(swapType) {
  const swaps = await db.getPendingSwaps(swapType);
  const ids = swaps.map(s => s.uuid);
  const transactions = getTransactions(swaps);

  try {
    const txHashes = await send(swapType, transactions);
    await db.updateSwapsTransferTransactionHash(ids, txHashes.join(','));
  } catch (e) {
    console.log('[Processing] Failed to process swaps: ', e);
  }
}

/**
 * Take an array of `swaps` and combine the ones going to the same `address`.
 *
 * @param {[{ amount, address: string }]} swaps An array of swaps.
 * @returns Simplified transactions from the swaps.
 */
export function getTransactions(swaps) {
  const amounts = {};

  // eslint-disable-next-line no-restricted-syntax
  for (const swap of swaps) {
    if (swap.address in amounts) {
      amounts[swap.address] += parseFloat(swap.amount) || 0;
    } else {
      amounts[swap.address] = parseFloat(swap.amount) || 0;
    }
  }

  return Object.keys(amounts).map(k => ({ address: k, amount: amounts[k] }));
}

/**
 * Send the given `swaps`.
 *
 * @param {string} swapType The type of swap.
 * @param {[{ address: string, amount: number }]} transactions An array of transactions.
 * @returns An array of transaction hashes
 */
export async function send(swapType, transactions) {
  // Multi-send always returns an array of hashes
  if (swapType === SWAP_TYPE.LOKI_TO_BLOKI) {
    const symbol = config.get('binance.symbol');
    const outputs = transactions.map(({ address, amount }) => ({
      to: address,
      coins: [{
        denom: symbol,
        amount,
      }],
    }));

    // Send BNB to the users
    return bnb.multiSend(config.get('binance.wallet.mnemonic'), outputs, 'Loki Bridge');
  } else if (swapType === SWAP_TYPE.BLOKI_TO_LOKI) {
    // Send Loki to the users
    return loki.multiSend(transactions);
  }

  throw new Error('Invalid swap type');
}