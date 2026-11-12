"""Desktop and mobile regression for the reported wallet and invoice UX, on the local chain.

Start the Mezo simulator and the v2 Vite server, then run this file. The injected
EIP-1193 provider forwards requests to Ganache; it is not MetaMask itself.
"""
import json
import os
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

sim = json.loads((Path(__file__).parent / '.sim.json').read_text())

def rpc(method, params=None):
    body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params or []}).encode()
    request = urllib.request.Request(sim['rpc'], body, {'content-type': 'application/json'})
    result = json.loads(urllib.request.urlopen(request).read())
    if 'error' in result: raise RuntimeError(result['error'])
    return result['result']

def mint(to, amount):
    data = '0x40c10f19' + to[2:].lower().rjust(64, '0') + hex(amount * 10**18)[2:].rjust(64, '0')
    tx = rpc('eth_sendTransaction', [{'from': sim['operator'], 'to': sim['musd'], 'data': data, 'gas': '0x30d40'}])
    receipt = rpc('eth_getTransactionReceipt', [tx])
    assert receipt['status'] == '0x1'

INJECT = """
window.ethereum = {
  account: localStorage.getItem('testAccount') || %s,
  chain: '0x7b7b',
  handlers: {},
  on(event, fn) { (this.handlers[event] ||= []).push(fn); },
  async request({method, params = []}) {
    if (method === 'eth_requestAccounts') { localStorage.setItem('testAuthorized', '1'); return [this.account]; }
    if (method === 'eth_accounts') return localStorage.getItem('testAuthorized') ? [this.account] : [];
    if (method === 'eth_chainId') return this.chain;
    if (method === 'wallet_switchEthereumChain') { this.switchChain(params[0].chainId); return null; }
    return window.testRpc(method, params);
  },
  switchAccount(next) {
    this.account = next;
    localStorage.setItem('testAccount', next);
    for (const fn of this.handlers.accountsChanged || []) fn([next]);
  },
  switchChain(next) {
    this.chain = next;
    for (const fn of this.handlers.chainChanged || []) fn(next);
  }
};
""" % json.dumps(sim['operator'])

with sync_playwright() as playwright:
    launch = {'headless': True}
    if os.getenv('PLAYWRIGHT_CHANNEL'): launch['channel'] = os.environ['PLAYWRIGHT_CHANNEL']
    browser = playwright.chromium.launch(**launch)
    for name, viewport in [('desktop', {'width': 1360, 'height': 900}), ('mobile', {'width': 390, 'height': 844})]:
        context = browser.new_context(viewport=viewport, is_mobile=name == 'mobile', has_touch=name == 'mobile')
        context.expose_function('testRpc', rpc)
        context.add_init_script(INJECT)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto('http://127.0.0.1:5173/')
        expect(page.locator('#connect-header')).to_have_text('Connect wallet')
        page.locator('[data-view="invoices"].menu-tab').click()
        expect(page.locator('#create-connect')).to_be_visible()
        expect(page.locator('#create-submit')).to_be_disabled()
        page.locator('[data-view="faucet"].menu-tab').click()
        expect(page.locator('[data-panel="faucet"]')).to_contain_text('cooldown')
        expect(page.locator('[data-panel="faucet"]')).to_contain_text('Wallet MUSD payments do not require a trove')
        page.locator('[data-view="invoices"].menu-tab').click()
        page.locator('#connect-header').click()
        expect(page.locator('#connect-header')).to_contain_text('Mezo testnet')
        expect(page.locator('#create-submit')).to_be_enabled()

        page.locator('#amount').fill('10')
        page.locator('#create-submit').click()
        expect(page.locator('#created')).to_be_visible(timeout=90_000)
        link = page.locator('#share-link').input_value()
        reference = page.locator('#invoice-id').input_value()
        for pasted in [link, link.removeprefix('https://'), reference + '&contract=' + sim['v2'], reference]:
            page.locator('#invoice-id').fill(pasted)
            page.locator('#lookup').click()
            expect(page.locator('#detail-amount')).to_have_text('10.00 MUSD', timeout=90_000)

        page.goto(link)
        expect(page.locator('#detail-amount')).to_have_text('10.00 MUSD', timeout=90_000)
        expect(page.locator('#invoice-details')).to_be_in_viewport()
        expect(page.locator('#connect-header')).to_contain_text(sim['operator'][:6])
        page.evaluate("localStorage.removeItem('testAuthorized')")
        page.reload()
        expect(page.locator('#invoice-connect')).to_be_visible(timeout=90_000)
        expect(page.locator('#pay')).to_be_disabled()
        page.locator('#invoice-connect').click()
        expect(page.locator('#connect-header')).to_contain_text(sim['operator'][:6])
        empty = '0x' + '33' * 20
        page.evaluate('(next) => window.ethereum.switchAccount(next)', empty)
        expect(page.locator('#borrow-eligibility')).to_contain_text('Add test BTC', timeout=90_000)
        expect(page.locator('#borrow-check')).to_be_disabled()
        mint(sim['treasury'], 10)
        page.evaluate('(next) => window.ethereum.switchAccount(next)', sim['treasury'])
        expect(page.locator('#message')).to_contain_text('Switched to', timeout=90_000)
        expect(page.locator('#connect-header')).to_contain_text(sim['treasury'][:6])
        page.wait_for_function("parseFloat(document.querySelector('#musd-balance').textContent) >= 10", timeout=90_000)
        page.evaluate("window.ethereum.switchChain('0x1')")
        expect(page.locator('#connect-header')).to_have_text('Connect wallet')
        page.evaluate("window.ethereum.switchChain('0x7b7b')")
        expect(page.locator('#connect-header')).to_contain_text(sim['treasury'][:6])
        expect(page.locator('#pay')).to_be_enabled()
        expect(page.locator('#borrow-eligibility')).to_contain_text('Your wallet has', timeout=90_000)
        page.locator('#pay').click()
        expect(page.locator('#payment-receipt')).to_be_visible(timeout=90_000)
        expect(page.locator('#receipt-summary')).to_contain_text('Merchant received 9.95 MUSD')
        assert '/tx/0x' in page.locator('#receipt-explorer').get_attribute('href')
        assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth'), name + ' horizontal overflow'
        assert not errors, errors
        print('PASS', name, 'connect, create, paste links, deep link, switch account, pay, receipt, layout')
        context.close()
    browser.close()
