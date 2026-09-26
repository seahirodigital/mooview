const SYNC_SHEET_NAME = '_MooView同期';
const TOKEN_PROPERTY_KEY = 'FINANCE_SIMULATION_SYNC_TOKEN';
const EDITABLE_SHEET_NAMES = ['資産一覧', '配当一覧', '月次収支', '月次計画', '設定'];

function configureFinanceSimulationSyncToken(token) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('同期トークンは32文字以上で設定してください。');
  }
  PropertiesService.getScriptProperties().setProperty(TOKEN_PROPERTY_KEY, token);
  return { configured: true };
}

function doGet(event) {
  try {
    const params = event.parameter || {};
    assertAuthorized_(params.token);
    if (params.action !== 'read') throw new Error('未対応の操作です。');
    const spreadsheet = SpreadsheetApp.openById(required_(params.spreadsheetId, 'スプレッドシートID'));
    const current = readState_(spreadsheet);
    // 可視シート側で削除された行を先に両側へ反映してから再結合する。
    // 先にreconcileすると削除行が相手側から復活するため、この順序を固定する。
    let state = refreshFromVisibleSheets_(spreadsheet, current);
    state = applyVisibleDeletion_(current, state, '資産一覧');
    state = applyVisibleDeletion_(current, state, '配当一覧');
    state = reconcileState_(state, 'asset');
    if (!sameState_(current, state)) writeState_(spreadsheet, state, 'asset');
    return response_({ ok: true, state: state, message: 'スプレッドシートから最新データを読み込みました。' });
  } catch (error) {
    return response_({ ok: false, error: error.message || String(error) });
  }
}

function doPost(event) {
  try {
    const request = JSON.parse(event.postData && event.postData.contents || '{}');
    assertAuthorized_(request.token);
    if (request.action !== 'write') throw new Error('未対応の操作です。');
    const spreadsheet = SpreadsheetApp.openById(required_(request.spreadsheetId, 'スプレッドシートID'));
    writeState_(spreadsheet, request.state || {}, 'asset');
    return response_({ ok: true, message: 'Googleスプレッドシートへ保存しました。' });
  } catch (error) {
    return response_({ ok: false, error: error.message || String(error) });
  }
}

/** シート上の直接編集を、Web・スマホと同じ連動処理へ通す。 */
function onEdit(event) {
  const spreadsheet = event && event.source;
  if (!spreadsheet) return;
  const editedName = event.range.getSheet().getName();
  if (EDITABLE_SHEET_NAMES.indexOf(editedName) === -1) return;
  const current = readState_(spreadsheet);
  let state = refreshFromVisibleSheets_(spreadsheet, current);
  state = applyVisibleDeletion_(current, state, editedName);
  state = carryEditedHoldingValues_(current, state, editedName);
  if (editedName === '月次計画') state = applyCurrentPlanToAssets_(state);
  const preference = editedName === '配当一覧' ? 'dividend' : 'asset';
  writeState_(spreadsheet, state, preference);
}

function initializeFinanceSimulationSheet() {
  const spreadsheet = SpreadsheetApp.getActive();
  const current = readState_(spreadsheet);
  writeState_(spreadsheet, current);
}

function writeState_(spreadsheet, state, preference) {
  const normalized = synchronizeCurrentPlan_(reconcileState_(normalizeState_(state), preference || 'asset'));
  writeTable_(spreadsheet, '資産一覧', [
    'id', 'linkedDividendId', 'category', 'name', 'ticker', 'amount', 'shares', 'averageCost', 'currentPrice', 'estimatedYield', 'payoutMonths', 'payoutDay', 'institution', 'note'
  ], normalized.assets);
  writeTable_(spreadsheet, '配当一覧', [
    'id', 'linkedAssetId', 'ticker', 'name', 'market', 'investedAmount', 'shares', 'averageCost', 'currentPrice', 'estimatedYield', 'usTaxRate', 'jpTaxRate', 'frequency', 'customFrequencyLabel', 'payoutMonths', 'payoutDay', 'manualMonthlyDividend', 'excludeFromPortfolio', 'note'
  ], normalized.dividendStocks);
  const cashflowRows = normalized.incomes.map(function (item) {
    return Object.assign({ type: 'income' }, item);
  }).concat(normalized.expenses.map(function (item) {
    return Object.assign({ type: 'expense' }, item);
  }));
  writeTable_(spreadsheet, '月次収支', ['type', 'id', 'name', 'category', 'amount', 'isRecurring', 'note'], cashflowRows);
  writeJsonSheet_(spreadsheet, '月次計画', {
    timelineColumns: normalized.timelineColumns,
    monthlyOverrides: normalized.monthlyOverrides,
    sicknessSchedule: normalized.sicknessSchedule,
  });
  writeJsonSheet_(spreadsheet, '設定', {
    simulationConfig: normalized.simulationConfig,
    customDividendFrequencies: normalized.customDividendFrequencies,
    customAssetCategories: normalized.customAssetCategories,
    customLabels: normalized.customLabels,
    categoryOrder: normalized.categoryOrder,
    assetTableLayout: normalized.assetTableLayout,
    customStyles: normalized.customStyles,
  });
  saveState_(spreadsheet, normalized);
}

function refreshFromVisibleSheets_(spreadsheet, baseState) {
  const result = normalizeState_(baseState);
  const assets = readTable_(spreadsheet, '資産一覧');
  const dividends = readTable_(spreadsheet, '配当一覧');
  const cashflow = readTable_(spreadsheet, '月次収支');
  if (assets.length) result.assets = assets.map(assetFromRow_);
  if (dividends.length) result.dividendStocks = dividends.map(dividendFromRow_);
  if (cashflow.length) {
    result.incomes = cashflow.filter(function (row) { return row.type === 'income'; }).map(incomeFromRow_);
    result.expenses = cashflow.filter(function (row) { return row.type === 'expense'; }).map(expenseFromRow_);
  }
  const schedule = readJsonSheet_(spreadsheet, '月次計画');
  const settings = readJsonSheet_(spreadsheet, '設定');
  Object.assign(result, schedule || {}, settings || {});
  return normalizeState_(result);
}

function reconcileState_(state, preference) {
  const normalized = normalizeState_(state);
  const linkedAssets = normalized.assets.filter(function (asset) { return asset.category === 'dividend_stocks'; });
  const remainingStocks = normalized.dividendStocks.slice();
  const mergedAssets = {};
  const mergedStocks = {};
  const createdStocks = [];
  const appendedAssets = [];

  linkedAssets.forEach(function (asset) {
    const stockIndex = findMatchingStockIndex_(asset, remainingStocks);
    if (stockIndex < 0) {
      const created = dividendFromAsset_(asset);
      mergedAssets[asset.id] = normalizeAsset_(asset);
      createdStocks.push(created);
      return;
    }
    const stock = remainingStocks.splice(stockIndex, 1)[0];
    if (preference === 'dividend') {
      const mergedStock = normalizeDividend_(Object.assign({}, stock, { linkedAssetId: asset.id }));
      mergedAssets[asset.id] = assetFromDividend_(asset, mergedStock);
      mergedStocks[stock.id] = mergedStock;
    } else {
      const mergedAsset = normalizeAsset_(asset);
      mergedAssets[asset.id] = mergedAsset;
      mergedStocks[stock.id] = dividendFromAsset_(mergedAsset, stock);
    }
  });

  remainingStocks.forEach(function (stock) {
    const normalizedStock = normalizeDividend_(stock);
    appendedAssets.push(assetFromDividend_(null, normalizedStock));
  });
  // 資産一覧は入力された元の行順を維持する。配当側にしか存在しない行だけ末尾へ追加する。
  const assets = normalized.assets.map(function (asset) {
    return asset.category === 'dividend_stocks' ? (mergedAssets[asset.id] || normalizeAsset_(asset)) : asset;
  }).concat(appendedAssets);
  // 配当一覧も元の行順を維持し、資産側から新設された配当行だけを末尾へ追加する。
  const dividendStocks = normalized.dividendStocks.map(function (stock) {
    return mergedStocks[stock.id] || normalizeDividend_(stock);
  }).concat(createdStocks);
  return Object.assign({}, normalized, { assets: assets, dividendStocks: dividendStocks });
}

function normalizeTicker_(value) { return String(value === null || value === undefined ? '' : value).trim().toUpperCase(); }
function holdingKey_(item) {
  const ticker = normalizeTicker_(item && item.ticker);
  return ticker ? 'ticker:' + ticker : 'name:' + String(item && item.name || '').replace(/[\s()（）]/g, '').toUpperCase();
}
function sameHolding_(left, right) {
  if (left && right && left.linkedDividendId && right.id === left.linkedDividendId) return true;
  if (left && right && right.linkedAssetId && left.id === right.linkedAssetId) return true;
  return holdingKey_(left) === holdingKey_(right);
}

function findMatchingStockIndex_(asset, stocks) {
  var index = stocks.findIndex(function (stock) {
    return (asset.linkedDividendId && stock.id === asset.linkedDividendId) || (stock.linkedAssetId && stock.linkedAssetId === asset.id);
  });
  if (index >= 0) return index;
  index = stocks.findIndex(function (stock) {
    return normalizeTicker_(stock.ticker) === normalizeTicker_(asset.ticker)
      && String(stock.name || '').replace(/[\s()（）]/g, '').toUpperCase() === String(asset.name || '').replace(/[\s()（）]/g, '').toUpperCase();
  });
  if (index >= 0) return index;
  var candidates = stocks.map(function (stock, candidateIndex) { return { stock: stock, index: candidateIndex }; }).filter(function (entry) {
    return normalizeTicker_(entry.stock.ticker) !== '' && normalizeTicker_(entry.stock.ticker) === normalizeTicker_(asset.ticker);
  });
  return candidates.length === 1 ? candidates[0].index : -1;
}

function normalizeAsset_(asset) {
  return Object.assign({}, asset, { ticker: normalizeTicker_(asset.ticker), amount: number_(asset.amount), currentPrice: optionalNumber_(asset.currentPrice) });
}

function normalizeDividend_(stock) {
  return Object.assign({}, stock, { ticker: normalizeTicker_(stock.ticker), investedAmount: number_(stock.investedAmount), currentPrice: optionalNumber_(stock.currentPrice) });
}

function dividendFromAsset_(asset, existing) {
  const source = normalizeAsset_(asset);
  return Object.assign({}, existing || {}, {
    id: existing && existing.id || 'div_' + source.id,
    linkedAssetId: source.id,
    ticker: source.ticker || source.name,
    name: source.name,
    market: existing && existing.market || 'OTHER',
    investedAmount: source.amount,
    shares: source.shares,
    averageCost: source.averageCost,
    currentPrice: source.currentPrice,
    estimatedYield: source.estimatedYield === undefined ? number_(existing && existing.estimatedYield) : source.estimatedYield,
    payoutMonths: source.payoutMonths !== undefined ? source.payoutMonths : existing && existing.payoutMonths || [],
    payoutDay: source.payoutDay !== undefined ? source.payoutDay : existing && existing.payoutDay,
    usTaxRate: existing && existing.usTaxRate === undefined ? 0 : existing && existing.usTaxRate,
    jpTaxRate: existing && existing.jpTaxRate === undefined ? 20 : existing && existing.jpTaxRate,
    frequency: existing && existing.frequency || 'monthly',
    note: source.note !== undefined ? source.note : existing && existing.note || '',
  });
}

function assetFromDividend_(existing, stock) {
  const source = normalizeDividend_(stock);
  return Object.assign({}, existing || {}, {
    id: existing && existing.id || 'asset_' + source.id,
    linkedDividendId: source.id,
    category: 'dividend_stocks',
    ticker: source.ticker,
    name: source.name,
    amount: source.investedAmount,
    shares: source.shares,
    averageCost: source.averageCost,
    currentPrice: source.currentPrice,
    estimatedYield: source.estimatedYield,
    payoutMonths: source.payoutMonths,
    payoutDay: source.payoutDay,
    institution: existing && existing.institution || (source.market === 'US' ? '証券口座' : '金融機関'),
    note: source.note !== undefined ? source.note : existing && existing.note || '',
  });
}

function applyVisibleDeletion_(previous, next, editedName) {
  const state = normalizeState_(next);
  if (editedName === '資産一覧') {
    previous.assets.filter(function (asset) { return asset.category === 'dividend_stocks'; }).forEach(function (asset) {
      const stillExists = state.assets.some(function (candidate) { return candidate.id === asset.id; });
      if (!stillExists) {
        state.dividendStocks = state.dividendStocks.filter(function (stock) {
          return !sameHolding_(asset, stock);
        });
      }
    });
  }
  if (editedName === '配当一覧') {
    previous.dividendStocks.forEach(function (stock) {
      const stillExists = state.dividendStocks.some(function (candidate) { return candidate.id === stock.id; });
      if (!stillExists) {
        state.assets = state.assets.filter(function (asset) {
          return !sameHolding_(asset, stock);
        });
      }
    });
  }
  return state;
}

function carryEditedHoldingValues_(previous, next, editedName) {
  const state = normalizeState_(next);
  if (editedName === '資産一覧') {
    state.assets.filter(function (asset) { return asset.category === 'dividend_stocks'; }).forEach(function (asset) {
      const oldAsset = previous.assets.find(function (candidate) { return candidate.id === asset.id; });
      if (!oldAsset) return;
      const index = oldAsset.linkedDividendId
        ? state.dividendStocks.findIndex(function (stock) { return stock.id === oldAsset.linkedDividendId; })
        : state.dividendStocks.findIndex(function (stock) { return sameHolding_(oldAsset, stock); });
      if (index >= 0) state.dividendStocks[index] = dividendFromAsset_(asset, state.dividendStocks[index]);
    });
  }
  if (editedName === '配当一覧') {
    state.dividendStocks.forEach(function (stock) {
      const oldStock = previous.dividendStocks.find(function (candidate) { return candidate.id === stock.id; });
      if (!oldStock) return;
      const index = oldStock.linkedAssetId
        ? state.assets.findIndex(function (asset) { return asset.id === oldStock.linkedAssetId; })
        : state.assets.findIndex(function (asset) { return asset.category === 'dividend_stocks' && sameHolding_(oldStock, asset); });
      if (index >= 0) state.assets[index] = assetFromDividend_(state.assets[index], stock);
    });
  }
  return state;
}

function synchronizeCurrentPlan_(state) {
  const normalized = normalizeState_(state);
  const monthlyDividend = totalMonthlyDividend_(normalized.assets, normalized.dividendStocks);
  normalized.incomes = normalized.incomes.map(function (item) {
    return item.id === 'inc_dividend' || item.category === 'dividend'
      ? Object.assign({}, item, { amount: monthlyDividend })
      : item;
  });
  const totals = {
    prog_core_stocks: totalForCategory_(normalized.assets, 'core_stocks'),
    prog_dividend_stocks: totalForCategory_(normalized.assets, 'dividend_stocks'),
    prog_cash_pool: totalForCategory_(normalized.assets, 'cash'),
    prog_illiquid: totalForCategory_(normalized.assets, 'illiquid_other'),
  };
  const hasRentAccount = normalized.assets.some(function (asset) {
    const name = String(asset.name || '').replace(/[\s　]/g, '');
    const category = normalized.customAssetCategories.find(function (item) { return item && item.id === asset.category; });
    return name.indexOf('家賃口座') >= 0 || String(category && category.label || '').replace(/[\s　]/g, '').indexOf('家賃口座') >= 0;
  });
  normalized.customAssetCategories.forEach(function (category) {
    if (!category || !category.id) return;
    totals['prog_category_' + category.id] = totalForCategory_(normalized.assets, category.id);
  });
  const currentIndex = normalized.timelineColumns.findIndex(function (column) { return column && column.isCurrent; });
  const rentInCash = normalized.assets.some(function (asset) {
    return asset.category === 'cash' && String(asset.name || '').replace(/[\s　]/g, '').indexOf('家賃口座') >= 0;
  });
  let accumulatedRent = 0;
  const rentCumulativeByCol = {};
  normalized.timelineColumns.forEach(function (column, index) {
    if (!column || !column.id) return;
    if (index > (currentIndex >= 0 ? currentIndex : 0)) {
      accumulatedRent += normalized.expenses
        .filter(function (item) { return String(item.name || '').replace(/[\s　]/g, '').indexOf('家賃') >= 0; })
        .reduce(function (sum, item) { return sum + number_(item.amount); }, 0);
    }
    rentCumulativeByCol[column.id] = Math.round(accumulatedRent * 10) / 10;
  });
  let accumulatedCashflow = 0;
  Object.keys(totals).forEach(function (rowId) {
    normalized.monthlyOverrides[rowId] = Object.assign({}, normalized.monthlyOverrides[rowId] || {}, {});
    normalized.timelineColumns.forEach(function (column, index) {
      if (column && column.id && rowId !== 'prog_cash_pool') normalized.monthlyOverrides[rowId][column.id] = totals[rowId];
      if (column && column.id && rowId === 'prog_cash_pool') {
        if (index > (currentIndex >= 0 ? currentIndex : 0)) {
          const previousColumn = normalized.timelineColumns[index - 1];
          accumulatedCashflow += monthlySurplusForColumn_(normalized, previousColumn);
        }
        const rentDeduction = hasRentAccount && rentInCash ? (rentCumulativeByCol[column.id] || 0) : 0;
        normalized.monthlyOverrides[rowId][column.id] = Math.round((totals[rowId] + accumulatedCashflow - rentDeduction) * 10) / 10;
      }
      if (column && column.id && rowId.indexOf('prog_category_') === 0) {
        const categoryId = rowId.slice('prog_category_'.length);
        const category = normalized.customAssetCategories.find(function (item) { return item && item.id === categoryId; });
        if (category && String(category.label || '').replace(/[\s　]/g, '').indexOf('家賃口座') >= 0 && hasRentAccount) {
          normalized.monthlyOverrides[rowId][column.id] = Math.round((totals[rowId] - (rentCumulativeByCol[column.id] || 0)) * 10) / 10;
        }
      }
    });
  });
  return normalized;
}

function totalMonthlyDividend_(assets, stocks) {
  return Math.round(stocks.reduce(function (sum, stock) {
    const matchingAssets = assets.filter(function (asset) {
      return (
        asset.linkedDividendId === stock.id
        || normalizeTicker_(asset.ticker) === normalizeTicker_(stock.ticker)
        || (!normalizeTicker_(asset.ticker) && String(asset.name || '').replace(/[\s()（）]/g, '').toUpperCase() === String(stock.name || '').replace(/[\s()（）]/g, '').toUpperCase())
      );
    });
    const investedAmount = matchingAssets.length
      ? matchingAssets.reduce(function (assetSum, asset) { return assetSum + number_(asset.amount); }, 0)
      : number_(stock.investedAmount);
    const grossYield = number_(stock.estimatedYield);
    if (stock.manualMonthlyDividend !== undefined && number_(stock.manualMonthlyDividend) > 0) {
      return sum + number_(stock.manualMonthlyDividend);
    }
    const netYield = stock.market === 'US'
      ? grossYield * (1 - number_(stock.usTaxRate || 10) / 100) * (1 - number_(stock.jpTaxRate || 20) / 100)
      : grossYield * (1 - number_(stock.jpTaxRate || 20) / 100);
    return sum + investedAmount * (netYield / 100) / 12;
  }, 0) * 10) / 10;
}

function monthlySurplusForColumn_(state, column) {
  const columnId = column && column.id;
  const income = state.incomes.reduce(function (sum, item) {
    const override = columnId && state.monthlyOverrides[item.id] && state.monthlyOverrides[item.id][columnId];
    if (override !== undefined) return sum + number_(override);
    if (item.id === 'inc_dividend' || item.category === 'dividend') return sum + totalDividendForMonth_(state.assets, state.dividendStocks, column && column.month);
    return sum + number_(item.amount);
  }, 0);
  const expense = state.expenses.reduce(function (sum, item) {
    const override = columnId && state.monthlyOverrides[item.id] && state.monthlyOverrides[item.id][columnId];
    return sum + (override !== undefined ? number_(override) : number_(item.amount));
  }, 0);
  return Math.round((income - expense) * 10) / 10;
}

function totalDividendForMonth_(assets, stocks, month) {
  return stocks.reduce(function (sum, stock) {
    const payoutMonths = Array.isArray(stock.payoutMonths) && stock.payoutMonths.length
      ? stock.payoutMonths
      : stock.frequency === 'semi_annual' ? [6, 12]
        : stock.frequency === 'quarterly' ? [3, 6, 9, 12]
          : stock.frequency === 'annual' ? [12]
            : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    if (month && payoutMonths.indexOf(month) < 0) return sum;
    const matchingAssets = assets.filter(function (asset) {
      return asset.linkedDividendId === stock.id
        || normalizeTicker_(asset.ticker) === normalizeTicker_(stock.ticker)
        || (!normalizeTicker_(asset.ticker) && String(asset.name || '').replace(/[\s()（）]/g, '').toUpperCase() === String(stock.name || '').replace(/[\s()（）]/g, '').toUpperCase());
    });
    const investedAmount = matchingAssets.length
      ? matchingAssets.reduce(function (assetSum, asset) { return assetSum + number_(asset.amount); }, 0)
      : number_(stock.investedAmount);
    if (stock.manualMonthlyDividend !== undefined && number_(stock.manualMonthlyDividend) > 0) return sum + number_(stock.manualMonthlyDividend);
    const grossYield = number_(stock.estimatedYield);
    const netYield = stock.market === 'US'
      ? grossYield * (1 - number_(stock.usTaxRate || 10) / 100) * (1 - number_(stock.jpTaxRate || 20) / 100)
      : grossYield * (1 - number_(stock.jpTaxRate || 20) / 100);
    return sum + (investedAmount * (netYield / 100)) / payoutMonths.length;
  }, 0);
}

function applyCurrentPlanToAssets_(state) {
  const normalized = normalizeState_(state);
  const current = normalized.timelineColumns.find(function (column) { return column && column.isCurrent; });
  if (!current || !current.id) return normalized;
  const mapping = { prog_core_stocks: 'core_stocks', prog_dividend_stocks: 'dividend_stocks', prog_cash_pool: 'cash', prog_illiquid: 'illiquid_other' };
  normalized.customAssetCategories.forEach(function (category) {
    if (category && category.id) mapping['prog_category_' + category.id] = category.id;
  });
  Object.keys(mapping).forEach(function (rowId) {
    const amount = normalized.monthlyOverrides[rowId] && normalized.monthlyOverrides[rowId][current.id];
    if (amount !== undefined) normalized.assets = distributeCategory_(normalized.assets, mapping[rowId], number_(amount));
  });
  return normalized;
}

function distributeCategory_(assets, category, amount) {
  const members = assets.filter(function (asset) { return asset.category === category; });
  if (!members.length) return amount === 0 ? assets : assets.concat([{ id: 'asset_summary_' + category, category: category, name: '月次表から追加', ticker: '', amount: amount, institution: '月次計画', note: '月次表からの連動入力' }]);
  const total = members.reduce(function (sum, asset) { return sum + number_(asset.amount); }, 0);
  let distributed = 0;
  const lastId = members[members.length - 1].id;
  return assets.map(function (asset) {
    if (asset.category !== category) return asset;
    const nextAmount = asset.id === lastId ? Math.max(0, amount - distributed) : (total > 0 ? Math.round(number_(asset.amount) / total * amount * 10) / 10 : (asset.id === members[0].id ? amount : 0));
    distributed += nextAmount;
    return Object.assign({}, asset, { amount: nextAmount });
  });
}

function totalForCategory_(assets, category) { return Math.round(assets.filter(function (asset) { return asset.category === category; }).reduce(function (sum, asset) { return sum + number_(asset.amount); }, 0) * 10) / 10; }
function sameState_(left, right) { return JSON.stringify(normalizeState_(left)) === JSON.stringify(normalizeState_(right)); }

function normalizeState_(state) {
  const assets = Array.isArray(state.assets) ? state.assets : [];
  const customAssetCategories = Array.isArray(state.customAssetCategories) ? state.customAssetCategories.slice() : [];
  const builtInCategories = ['cash', 'core_stocks', 'dividend_stocks', 'illiquid_other'];
  // スプシの資産一覧で直接入力された新規区分も、画面のプルダウンと月次行に登録する。
  assets.forEach(function (asset) {
    const category = String(asset && asset.category || '').trim();
    if (!category || builtInCategories.indexOf(category) >= 0) return;
    if (!customAssetCategories.some(function (item) { return item && item.id === category; })) {
      customAssetCategories.push({ id: category, label: category, color: '#5ac8fa' });
    }
  });
  return {
    assets: assets,
    dividendStocks: Array.isArray(state.dividendStocks) ? state.dividendStocks : [],
    expenses: Array.isArray(state.expenses) ? state.expenses : [],
    incomes: Array.isArray(state.incomes) ? state.incomes : [],
    sicknessSchedule: Array.isArray(state.sicknessSchedule) ? state.sicknessSchedule : [],
    simulationConfig: state.simulationConfig || {},
    timelineColumns: Array.isArray(state.timelineColumns) ? state.timelineColumns : [],
    monthlyOverrides: state.monthlyOverrides || {},
    customDividendFrequencies: Array.isArray(state.customDividendFrequencies) ? state.customDividendFrequencies : [],
    customAssetCategories: customAssetCategories,
    customLabels: state.customLabels || {},
    categoryOrder: Array.isArray(state.categoryOrder) ? state.categoryOrder : ['core_stocks', 'dividend_stocks', 'cash', 'illiquid_other'],
    assetTableLayout: state.assetTableLayout && typeof state.assetTableLayout === 'object' ? {
      columnOrder: Array.isArray(state.assetTableLayout.columnOrder) ? state.assetTableLayout.columnOrder : [],
      columnWidths: state.assetTableLayout.columnWidths && typeof state.assetTableLayout.columnWidths === 'object' ? state.assetTableLayout.columnWidths : {},
    } : { columnOrder: [], columnWidths: {} },
    customStyles: state.customStyles && typeof state.customStyles === 'object' ? {
      cells: state.customStyles.cells && typeof state.customStyles.cells === 'object' ? state.customStyles.cells : {},
      rows: state.customStyles.rows && typeof state.customStyles.rows === 'object' ? state.customStyles.rows : {},
      cols: state.customStyles.cols && typeof state.customStyles.cols === 'object' ? state.customStyles.cols : {},
    } : { cells: {}, rows: {}, cols: {} },
  };
}

function assetFromRow_(row) {
  return {
    id: row.id || Utilities.getUuid(), linkedDividendId: row.linkedDividendId || undefined, category: row.category || 'cash', name: row.name || '資産', ticker: normalizeTicker_(row.ticker),
    amount: number_(row.amount), shares: optionalNumber_(row.shares), averageCost: optionalNumber_(row.averageCost), currentPrice: optionalNumber_(row.currentPrice),
    estimatedYield: optionalNumber_(row.estimatedYield), payoutMonths: String(row.payoutMonths || '').split(',').map(Number).filter(function (month) { return month >= 1 && month <= 12; }), payoutDay: optionalNumber_(row.payoutDay), institution: row.institution || '', note: row.note || '',
  };
}

function dividendFromRow_(row) {
  return {
    id: row.id || Utilities.getUuid(), linkedAssetId: row.linkedAssetId || undefined, ticker: normalizeTicker_(row.ticker) || 'ETF', name: row.name || '銘柄', market: row.market || 'OTHER',
    investedAmount: number_(row.investedAmount), shares: optionalNumber_(row.shares), averageCost: optionalNumber_(row.averageCost), currentPrice: optionalNumber_(row.currentPrice),
    estimatedYield: number_(row.estimatedYield), usTaxRate: number_(row.usTaxRate), jpTaxRate: number_(row.jpTaxRate),
    frequency: row.frequency || 'monthly', customFrequencyLabel: row.customFrequencyLabel || undefined,
    payoutMonths: String(row.payoutMonths || '').split(',').map(Number).filter(function (month) { return month >= 1 && month <= 12; }),
    payoutDay: optionalNumber_(row.payoutDay), manualMonthlyDividend: optionalNumber_(row.manualMonthlyDividend),
    excludeFromPortfolio: String(row.excludeFromPortfolio).toLowerCase() === 'true' || row.excludeFromPortfolio === true,
    note: row.note || '',
  };
}

function incomeFromRow_(row) {
  return { id: row.id || Utilities.getUuid(), name: row.name || '収入', amount: number_(row.amount), category: row.category || 'other', isRecurring: String(row.isRecurring) !== 'false', note: row.note || '' };
}

function expenseFromRow_(row) {
  return { id: row.id || Utilities.getUuid(), name: row.name || '支出', amount: number_(row.amount), category: row.category || 'other', note: row.note || '' };
}

function writeTable_(spreadsheet, name, headers, rows) {
  const sheet = getOrCreateSheet_(spreadsheet, name);
  sheet.clear();
  const values = [headers].concat(rows.map(function (row) {
    return headers.map(function (header) {
      const value = row[header];
      return Array.isArray(value) ? value.join(',') : (value === undefined || value === null ? '' : value);
    });
  }));
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#dbeafe');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function readTable_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values[0].map(String);
  return values.slice(1).filter(function (row) { return row.some(function (value) { return value !== ''; }); }).map(function (row) {
    const item = {};
    headers.forEach(function (header, index) { item[header] = row[index]; });
    return item;
  });
}

function writeJsonSheet_(spreadsheet, name, value) {
  const sheet = getOrCreateSheet_(spreadsheet, name);
  sheet.clear();
  sheet.getRange('A1').setValue('JSONを直接編集した場合は、必ず有効なJSON形式にしてください。');
  sheet.getRange('A2').setValue(JSON.stringify(value));
  sheet.setColumnWidth(1, 900);
}

function readJsonSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) return null;
  const value = sheet.getRange('A2').getValue();
  if (!value) return null;
  try { return JSON.parse(value); } catch (_) { return null; }
}

function saveState_(spreadsheet, state) {
  const sheet = getOrCreateSheet_(spreadsheet, SYNC_SHEET_NAME);
  sheet.clear();
  sheet.getRange('A1').setValue('updatedAt');
  sheet.getRange('B1').setValue(new Date().toISOString());
  sheet.getRange('A2').setValue(JSON.stringify(normalizeState_(state)));
  sheet.hideSheet();
}

function readState_(spreadsheet) {
  const sheet = spreadsheet.getSheetByName(SYNC_SHEET_NAME);
  if (!sheet) return normalizeState_({});
  try { return normalizeState_(JSON.parse(sheet.getRange('A2').getValue() || '{}')); } catch (_) { return normalizeState_({}); }
}

function getOrCreateSheet_(spreadsheet, name) {
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function assertAuthorized_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(TOKEN_PROPERTY_KEY);
  if (!expected || token !== expected) throw new Error('同期トークンが一致しません。');
}

function required_(value, label) {
  if (!value) throw new Error(label + 'を指定してください。');
  return value;
}

function number_(value) { return Number(value) || 0; }
function optionalNumber_(value) { return value === '' || value === null || value === undefined ? undefined : number_(value); }
function response_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
