"""Browser end-to-end run of the SettleTag app against the local Mezo simulator.

Start `node test/e2e/sim-chain.js`, then Vite twice (see test/e2e/README.md), then run:
    python3 test/e2e/app_flow.py <screenshot-dir>
"""
import json, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

SIM = json.loads((Path(__file__).parent / '.sim.json').read_text())
V2_APP, V1_APP = 'http://127.0.0.1:5173/', 'http://127.0.0.1:5174/'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
SHOTS.mkdir(parents=True, exist_ok=True)
PASSWORD = 'local-test-password-123'
TIMEOUT = 90_000
results = []

def rpc(method, params):
    req = urllib.request.Request(SIM['rpc'], json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params}).encode(), {'content-type': 'application/json'})
    out = json.loads(urllib.request.urlopen(req).read())
    if 'error' in out: raise RuntimeError(out['error'])
    return out['result']

def fund_btc(address, btc):
    rpc('evm_setAccountBalance', [address, hex(int(btc * 10**18))])

def musd_balance(address):
    return int(rpc('eth_call', [{'to': SIM['musd'], 'data': '0x70a08231' + address[2:].lower().rjust(64, '0')}, 'latest']), 16) / 10**18

def check(name, condition, detail=''):
    results.append((name, bool(condition), detail))
    print(('PASS ' if condition else 'FAIL ') + name + (f' — {detail}' if detail else ''))

def wait_message(page, text):
    expect(page.locator('#message')).to_contain_text(text, timeout=TIMEOUT)

def act(page, selector, text):
    """Clear the status line, click, and wait for the expected status text."""
    page.evaluate("document.getElementById('message').textContent = ''")
    page.click(selector)
    wait_message(page, text)

def new_wallet(browser, app, btc=None):
    ctx = browser.new_context(viewport={'width': 1360, 'height': 1000})
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(app)
    page.click('.sheet-tab[data-view="wallet"]')
    page.fill('#wallet-password', PASSWORD)
    act(page, '#create-wallet', 'Test wallet created')
    page.click('#hide-recovery')
    address = page.inner_text('#wallet-address').strip()
    if btc: fund_btc(address, btc)
    return ctx, page, address, errors

def create_invoice(page, amount):
    page.click('.sheet-tab[data-view="invoices"]')
    page.fill('#amount', str(amount))
    act(page, '#create-form button[type="submit"]', 'Invoice created onchain.')
    return page.input_value('#invoice-id')

def load_invoice(page, invoice_id):
    page.click('.sheet-tab[data-view="invoices"]')
    page.fill('#invoice-id', invoice_id)
    act(page, '#lookup', 'Invoice loaded')

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- v2 contract: fees, trove-funded settlement, Pro plan ----------
    m_ctx, merchant, m_addr, m_errors = new_wallet(browser, V2_APP, btc=1)
    merchant.click('.sheet-tab[data-view="invoices"]')
    merchant.fill('#amount', '25')
    expect(merchant.locator('#fee-note')).to_contain_text('you receive', timeout=TIMEOUT)
    check('v2 merchant sees fee before creating', 'you receive 24.88 MUSD' in merchant.inner_text('#fee-note') or '24.875' in merchant.inner_text('#fee-note'), merchant.inner_text('#fee-note'))
    inv1 = create_invoice(merchant, 25)
    check('v2 invoice shows fee and net', '0.13 MUSD' in merchant.inner_text('#detail-fee') and '24.88 MUSD' in merchant.inner_text('#detail-net'), merchant.inner_text('#detail-fee') + ' / ' + merchant.inner_text('#detail-net'))
    check('v2 invoice on v2 contract', 'v2' in merchant.inner_text('#detail-contract'))
    share = merchant.input_value('#share-link')
    check('share link names the contract', f"contract={SIM['v2']}" in share, share)
    merchant.screenshot(path=str(SHOTS / '01-merchant-invoice.png'), full_page=True)

    p_ctx, payer, p_addr, p_errors = new_wallet(browser, V2_APP, btc=0.2)
    load_invoice(payer, inv1)
    payer.click('#borrow-check')
    expect(payer.locator('#borrow-plan')).to_be_visible(timeout=TIMEOUT)
    summary = payer.inner_text('#borrow-summary')
    check('no-trove payer gets an open-trove plan', 'No active trove' in summary and 'Returned to your wallet' in summary, summary.replace('\n', ' | '))
    check('collateral suggested for 200%', float(payer.input_value('#borrow-collateral') or 0) > 0, payer.input_value('#borrow-collateral'))
    payer.screenshot(path=str(SHOTS / '02-payer-open-trove-plan.png'), full_page=True)
    act(payer, '#borrow-pay', 'in one transaction')
    check('open-trove payment settles invoice', payer.inner_text('#detail-status') == 'Paid' and payer.inner_text('#detail-funding') == 'New Mezo trove', payer.inner_text('#detail-funding'))
    check('merchant received net of fee', abs(musd_balance(m_addr) - 24.875) < 1e-9, str(musd_balance(m_addr)))
    check('payer received rest of the loan', musd_balance(p_addr) > 1700, str(musd_balance(p_addr)))

    inv2 = create_invoice(merchant, 40)
    load_invoice(payer, inv2)
    payer.click('#borrow-check')
    expect(payer.locator('#borrow-summary')).to_contain_text('Draw from your trove', timeout=TIMEOUT)
    summary = payer.inner_text('#borrow-summary')
    check('trove payer gets a draw plan with ratio before/after', '→' in summary and 'Liquidation price' in summary, summary.replace('\n', ' | '))
    payer.screenshot(path=str(SHOTS / '03-payer-draw-plan.png'), full_page=True)
    payer_musd_before = musd_balance(p_addr)
    act(payer, '#borrow-pay', 'in one transaction')
    check('draw payment settles invoice', payer.inner_text('#detail-funding') == 'Borrowed from Mezo trove')
    check('draw leaves wallet MUSD untouched', abs(musd_balance(p_addr) - payer_musd_before) < 1e-9)

    inv3 = create_invoice(merchant, 10)
    load_invoice(payer, inv3)
    act(payer, '#pay', 'MUSD paid to the merchant')
    check('wallet payment settles invoice', payer.inner_text('#detail-funding') == 'Wallet MUSD')

    payer.click('.sheet-tab[data-view="trove"]')
    expect(payer.locator('#trove-icr')).not_to_have_text('—', timeout=TIMEOUT)
    check('trove sheet shows health', payer.inner_text('#trove-tag') in ('Healthy', 'Watch', 'At risk'), payer.inner_text('#trove-icr') + ' ' + payer.inner_text('#trove-tag'))
    icr_before = payer.inner_text('#trove-icr')
    payer.fill('#add-coll', '0.01')
    act(payer, '#add-coll-btn', 'Collateral added')
    check('adding collateral raises ratio', payer.inner_text('#trove-icr') != icr_before, f"{icr_before} → {payer.inner_text('#trove-icr')}")
    payer.fill('#repay-amount', '5')
    act(payer, '#repay-btn', 'Repaid')
    payer.screenshot(path=str(SHOTS / '04-trove-sheet.png'), full_page=True)
    payer.set_viewport_size({'width': 390, 'height': 900})
    payer.screenshot(path=str(SHOTS / '05-trove-sheet-mobile.png'), full_page=True)
    overflow = payer.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    check('no horizontal overflow at 390 px (trove)', not overflow)
    payer.set_viewport_size({'width': 1360, 'height': 1000})

    merchant.click('.sheet-tab[data-view="invoices"]')
    expect(merchant.locator('#pro-card')).to_be_visible(timeout=TIMEOUT)
    act(merchant, '#buy-pro', 'SettleTag Pro active')
    merchant.fill('#amount', '12')
    expect(merchant.locator('#fee-note')).to_contain_text('Pro plan active', timeout=TIMEOUT)
    inv4 = create_invoice(merchant, 12)
    check('Pro invoice has no fee', '0%' in merchant.inner_text('#detail-fee'), merchant.inner_text('#detail-fee'))
    check('treasury collected fees and plan', abs(musd_balance(SIM['treasury']) - (0.125 + 0.2 + 0.05 + 5)) < 1e-9, str(musd_balance(SIM['treasury'])))

    merchant.click('.sheet-tab[data-view="overview"]')
    expect(merchant.locator('#stat-invoices')).to_have_text('4', timeout=TIMEOUT)
    check('ledger counts', merchant.inner_text('#stat-paid') == '3 paid' and merchant.inner_text('#stat-merchants') == '1' and merchant.inner_text('#stat-payers') == '1' and merchant.inner_text('#stat-trove') == '65.00',
          ' / '.join(merchant.inner_text(s) for s in ['#stat-paid', '#stat-merchants', '#stat-payers', '#stat-trove']))
    merchant.screenshot(path=str(SHOTS / '06-overview-ledger.png'), full_page=True)

    # self-payment is refused in the UI before signing
    load_invoice(merchant, inv4)
    act(merchant, '#borrow-check', 'cannot pay their own invoice')
    check('merchant cannot pay own invoice', True)

    # ---------- v1 contract (current live default until v2 is deployed) ----------
    m1_ctx, m1, m1_addr, m1_errors = new_wallet(browser, V1_APP, btc=1)
    v1_inv = create_invoice(m1, 3)
    check('v1 invoice on v1 contract with no fee rows', 'v1' in m1.inner_text('#detail-contract') and not m1.locator('#row-fee').is_visible())
    check('v1 hides Pro and ledger', not m1.locator('#pro-card').is_visible())
    p1_ctx, p1, p1_addr, p1_errors = new_wallet(browser, V1_APP, btc=0.2)
    load_invoice(p1, v1_inv)
    p1.click('#borrow-check')
    expect(p1.locator('#borrow-summary')).to_contain_text('3 transactions', timeout=TIMEOUT)
    act(p1, '#borrow-pay', 'Borrowed against BTC and paid the merchant.')
    check('v1 open-trove-and-pay settles', p1.inner_text('#detail-status') == 'Paid')
    check('v1 merchant received full amount', abs(musd_balance(m1_addr) - 3) < 1e-9, str(musd_balance(m1_addr)))
    v1_inv2 = create_invoice(m1, 4)
    load_invoice(p1, v1_inv2)
    p1.click('#borrow-check')
    expect(p1.locator('#borrow-summary')).to_contain_text('Draw from your trove', timeout=TIMEOUT)
    act(p1, '#borrow-pay', 'Borrowed against BTC and paid the merchant.')
    check('v1 draw-and-pay settles', p1.inner_text('#detail-status') == 'Paid')

    # v2 app still reads v1 receipts
    load_invoice(merchant, v1_inv)
    check('v2 app falls back to v1 receipts', 'v1' in merchant.inner_text('#detail-contract') and merchant.inner_text('#detail-status') == 'Paid')

    # A v1 invoice that copies a v2 invoice's ID must not hijack the v2 link or a manual lookup.
    inv5 = create_invoice(merchant, 7)
    v2_link = merchant.input_value('#share-link')
    rpc('eth_sendTransaction', [{'from': SIM['operator'], 'to': SIM['legacy'], 'gas': hex(300000),
        'data': '0xf9028084' + inv5[2:] + hex(10**18)[2:].rjust(64, '0') + hex(2_000_000_000)[2:].rjust(64, '0')}])
    merchant.goto(v2_link)
    expect(merchant.locator('#detail-contract')).to_contain_text('v2', timeout=TIMEOUT)
    check('contract in link resolves the right invoice', merchant.inner_text('#detail-amount') == '7.00 MUSD', merchant.inner_text('#detail-amount'))
    merchant.fill('#invoice-id', inv5)
    act(merchant, '#lookup', 'exists on both SettleTag contracts')
    check('ambiguous manual lookup is refused', True)

    page_errors = m_errors + p_errors + m1_errors + p1_errors
    check('no uncaught page errors', not page_errors, '; '.join(page_errors[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
