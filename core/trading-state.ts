export interface OpenArbitragePosition {
  symbol: string;
  mexcSymbol: string;
  bingxSymbol: string;
  longExchange: 'MEXC' | 'BingX';
  shortExchange: 'MEXC' | 'BingX';
  entryLongPrice: number;
  entryShortPrice: number;
  openedAt: number;
}

let tradingEnabled = false;
let openPosition: OpenArbitragePosition | null = null;

export function isTradingEnabled(): boolean {
  return tradingEnabled;
}

export function enableTrading(): void {
  tradingEnabled = true;
}

export function disableTrading(): void {
  tradingEnabled = false;
}

export function getOpenPosition(): OpenArbitragePosition | null {
  return openPosition;
}

export function setOpenPosition(position: OpenArbitragePosition | null): void {
  openPosition = position;
}
