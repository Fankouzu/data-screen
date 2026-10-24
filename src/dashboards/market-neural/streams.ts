// Deterministic paper-market samples: appending never rewrites existing history.
export const Z_CAPACITY = 280;
export const Z_INITIAL_SAMPLES = 220;
export const Z_SAMPLE_RATE = 12;
const random = (index: number, seed: number) => {
  const value = Math.sin(index * 127.1 + seed * 311.7) * 43758.5453;
  return value - Math.floor(value);
};
const assets = [
  { name: 'BTC', color: '#8ce8ff', anchors: [0, -.3, -.45, .05, .32, .08, -.24, .65, .5, .22, 1, 1.5, 1.8] },
  { name: 'ETH', color: '#8faedc', anchors: [-.1, -.4, -.65, -.3, -.6, .1, .7, .3, 1, .5, .65, .7, .5] },
  { name: 'SOL', color: '#ed5bb6', anchors: [0, .3, .4, .8, .6, .9, .4, -.2, .8, .5, .3, .6, 1.05] },
  { name: 'XRP', color: '#e3c66a', anchors: [0, .35, .4, .6, .6, 1, 1.1, .4, .6, .35, .2, -.1, .1] },
];

export function createZHistory(cycle: number) {
  return assets.map((asset, series) => {
    let jitter = 0;
    const values = Array.from({ length: Z_CAPACITY + 1 }, (_, i) => {
      const position = i / Z_CAPACITY * (asset.anchors.length - 1);
      const index = Math.min(asset.anchors.length - 2, Math.floor(position));
      const fraction = position - index;
      jitter = jitter * .78 + (random(i, series + cycle * 7 + 1) - .5) * .19;
      return asset.anchors[index]! * (1 - fraction) + asset.anchors[index + 1]! * fraction + jitter;
    });
    return { ...asset, values };
  });
}

export function createWireOrder(sequence: number) {
  const buy = random(sequence, 2) > .46;
  const quantity = Math.round(18 + random(sequence, 3) * 730);
  const price = .51 + random(sequence, 4) * .14;
  const milliseconds = Date.UTC(2026, 9, 24, 15, 42, 35) + sequence / 6 * 1000;
  return {
    id: `ord-${sequence}`, time: new Date(milliseconds).toISOString().slice(11, 23),
    hash: `0x${(0x3b7df + sequence * 7919).toString(16)}…${(0xfd27 + sequence * 13).toString(16).slice(-4)}`,
    asset: ['BTC', 'ETH', 'SOL', 'XRP'][sequence % 4],
    event: sequence % 11 === 0 ? 'CANCEL' : sequence % 5 === 0 ? 'FILL' : 'LIMIT',
    buy, side: buy ? 'BUY' : 'SELL', price: price.toFixed(3), quantity,
    value: (quantity * price).toFixed(2), highlight: sequence % 17 === 0,
  };
}
