import { Candle, Timeframe } from './types';

export type SymbolExpressionOperator = '/' | '-';

export interface SymbolExpression {
  left: string;
  operator: SymbolExpressionOperator;
  right: string;
}

interface ExpressionQuoteInput {
  price: number;
  changePct: number;
}

export interface ExpressionQuote {
  price: number;
  changePct: number | null;
}

const EXPRESSION_OPERAND_PATTERN = /^[A-Za-z0-9._]+$/;

function applyOperator(
  left: number,
  right: number,
  operator: SymbolExpressionOperator,
): number | null {
  if (operator === '/' && right === 0) return null;
  const result = operator === '/' ? left / right : left - right;
  return Number.isFinite(result) ? result : null;
}

export function parseSymbolExpression(value: string): SymbolExpression | null {
  const compactValue = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/／/g, '/')
    .replace(/[−–—]/g, '-');
  if (!compactValue) return null;

  const slashIndexes = Array.from(compactValue.matchAll(/\//g), (match) => match.index ?? -1);
  const minusIndexes = Array.from(compactValue.matchAll(/-/g), (match) => match.index ?? -1);
  if (slashIndexes.length + minusIndexes.length !== 1) return null;

  const operator: SymbolExpressionOperator = slashIndexes.length === 1 ? '/' : '-';
  const operatorIndex = operator === '/' ? slashIndexes[0] : minusIndexes[0];
  const left = compactValue.slice(0, operatorIndex);
  const right = compactValue.slice(operatorIndex + 1);

  if (
    !left
    || !right
    || !EXPRESSION_OPERAND_PATTERN.test(left)
    || !EXPRESSION_OPERAND_PATTERN.test(right)
  ) {
    return null;
  }

  return {
    left,
    operator,
    right,
  };
}

export function formatSymbolExpression(expression: SymbolExpression): string {
  return `${expression.left}${expression.operator}${expression.right}`;
}

export function getSymbolOperands(symbol: string): string[] {
  const expression = parseSymbolExpression(symbol);
  return expression ? [expression.left, expression.right] : [symbol];
}

function getCandleAlignmentKey(candle: Candle, timeframe: Timeframe): string {
  if (timeframe === '1d' || timeframe === '1w' || timeframe === '1mo') {
    return candle.timeStr.slice(0, 10);
  }
  return String(candle.time);
}

export function combineExpressionCandles(
  expression: SymbolExpression,
  leftCandles: Candle[],
  rightCandles: Candle[],
  timeframe: Timeframe,
): Candle[] {
  const rightByTime = new Map(
    rightCandles.map((candle) => [getCandleAlignmentKey(candle, timeframe), candle]),
  );

  return leftCandles.flatMap((leftCandle): Candle[] => {
    const rightCandle = rightByTime.get(getCandleAlignmentKey(leftCandle, timeframe));
    if (!rightCandle) return [];

    const open = applyOperator(leftCandle.open, rightCandle.open, expression.operator);
    const close = applyOperator(leftCandle.close, rightCandle.close, expression.operator);
    if (open === null || close === null) return [];

    let high: number;
    let low: number;
    if (expression.operator === '-') {
      high = Math.max(open, close, leftCandle.high - rightCandle.low);
      low = Math.min(open, close, leftCandle.low - rightCandle.high);
    } else {
      const ratioCandidates = [
        open,
        close,
        applyOperator(leftCandle.low, rightCandle.low, '/'),
        applyOperator(leftCandle.low, rightCandle.high, '/'),
        applyOperator(leftCandle.high, rightCandle.low, '/'),
        applyOperator(leftCandle.high, rightCandle.high, '/'),
      ].filter((value): value is number => value !== null);
      high = Math.max(...ratioCandidates);
      low = Math.min(...ratioCandidates);
    }

    return [{
      time: leftCandle.time,
      timeStr: leftCandle.timeStr,
      open,
      high,
      low,
      close,
      volume: 0,
    }];
  });
}

export function calculateExpressionQuote(
  expression: SymbolExpression,
  leftQuote: ExpressionQuoteInput,
  rightQuote: ExpressionQuoteInput,
): ExpressionQuote | null {
  const price = applyOperator(leftQuote.price, rightQuote.price, expression.operator);
  if (price === null) return null;

  const leftPreviousClose = leftQuote.price / (1 + leftQuote.changePct / 100);
  const rightPreviousClose = rightQuote.price / (1 + rightQuote.changePct / 100);
  const previousValue = applyOperator(
    leftPreviousClose,
    rightPreviousClose,
    expression.operator,
  );
  const changePct = previousValue === null || previousValue === 0
    ? null
    : ((price - previousValue) / Math.abs(previousValue)) * 100;

  return {
    price,
    changePct: Number.isFinite(changePct) ? changePct : null,
  };
}
