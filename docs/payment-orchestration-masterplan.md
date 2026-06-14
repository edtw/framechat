# Payment Orchestration Master Plan

## Vision

Automated system that connects a **rooted Android phone** to a **payment terminal (POS)** via NFC/Bluetooth/USB, registers cards automatically, triggers transactions, and captures the full API interaction for reverse engineering.

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR (Claude Code)                │
│  Controls: phone automation, terminal interaction, capture  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐     NFC/Bluetooth     ┌──────────────────┐    │
│  │  Phone 1 │◄────────────────────►│  POS Terminal 1   │    │
│  │ (rooted) │                       │  (Stone/PagSeguro │    │
│  │  Frida   │     USB/Serial         │   MercadoPago/   │    │
│  │  MITM    │◄────────────────────►│   Cielo/Getnet)   │    │
│  └──────────┘                       └──────────────────┘    │
│       │                                   │                  │
│       │  Captures:                        │  Captures:       │
│       │  - App API calls                  │  - Serial logs   │
│       │  - NFC HCE data                   │  - Firmware dump │
│       │  - Bluetooth pairing              │  - Key exchange  │
│       │  - App-to-terminal protocol       │  - EMV data      │
│       ▼                                   ▼                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Analysis Pipeline                        │    │
│  │  sessions/<timestamp>/                                │    │
│  │  ├── phone_traffic.jsonl    (API calls)               │    │
│  │  ├── terminal_serial.log    (terminal UART/USB)       │    │
│  │  ├── nfc_capture.pcap       (NFC sniff if proxied)    │    │
│  │  ├── transaction_flow.json  (reconstructed flow)      │    │
│  │  └── card_data.json         (registered card info)    │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Payment Terminal Landscape (Brazil Focus)

### Major Brazilian Acquirers / PSPs

| Brand | Terminal Models | Connectivity | OS / Platform |
|---|---|---|---|
| **Stone** | Stone T1, T2, T3, Stone Tap | WiFi, 4G, Bluetooth, NFC | Android-based (T2+) |
| **PagSeguro** | Moderninha Smart, Minizinha, Moderninha Plus | WiFi, 3G, Bluetooth | Android (Smart), Proprietary |
| **Mercado Pago** | Point Smart, Point Pro, Point Mini | WiFi, 4G, Bluetooth, NFC | Android (Smart/Pro) |
| **Cielo** | Cielo LIO, LIO+, ZIP | WiFi, 4G, Bluetooth | Android (LIO) |
| **Getnet** | Getnet POS, T1, T2 | WiFi, 4G | Android-based |
| **Rede** | Rede Smart, D180, D210 | WiFi, 3G/4G | Linux/Proprietary |
| **SumUp** | SumUp Top, SumUp Solo | WiFi, 3G, Bluetooth | Proprietary |
| **SafraPay** | SafraPay POS | WiFi, 4G | Android-based |
| **PicPay** | PicPay POS | WiFi, Bluetooth | Android-based |
| **InfinitePay** | InfinitePay POS, Smart, Tap | WiFi, Bluetooth, NFC | Android |

### Terminal Communication Paths

```
PHONE ──► TERMINAL (for card registration/transaction)

Path A: NFC (HCE - Host Card Emulation)
  Phone emulates a physical card via HCE
  Terminal reads phone as if it were a contactless card
  Protocol: ISO 14443-4 → EMV contactless
  Key: Phone app controls what card data is sent

Path B: Bluetooth (App-to-Terminal)
  Payment app connects to terminal via Bluetooth SPP/BLE
  Sends transaction amount → terminal processes → returns result
  Protocol: Proprietary (varies by acquirer)

Path C: USB/Serial
  Physical connection between phone and terminal
  Phone acts as POS management device
  Protocol: May expose AT commands or proprietary serial protocol

Path D: Cloud API
  Both phone and terminal connect to acquirer's cloud API
  Transaction is orchestrated server-side
  Phone just triggers, terminal executes
```

---

## Phase 2: Attack Surface per Terminal

### Android-Based Terminals (Stone T2, MercadoPago Point, Cielo LIO, etc.)

These are essentially Android devices — same toolchain as the Revolut project:

```
1. Enable Developer Options on terminal
   - Tap build number 7 times on terminal
   - Enable USB Debugging
   
2. Extract terminal APK
   adb shell pm list packages | grep -iE "stone|pagseguro|mercadopago|cielo"
   adb pull /data/app/.../base.apk terminal.apk

3. Decompile terminal APK
   jadx terminal.apk -d terminal_decompiled/

4. Find:
   - Bluetooth pairing protocol
   - NFC card data format
   - API endpoints for transaction processing
   - Encryption keys (hardcoded?)
   - Card tokenization flow

5. MITM via Frida (if rootable)
   - Hook Bluetooth pairing to capture keys
   - Hook NFC HCE service to capture card emulation data
   - Hook transaction API calls
```

### Proprietary Terminals (SumUp, older models)

```
1. UART/JTAG access
   - Open terminal case
   - Identify UART pads (TX/RX/GND)
   - Connect USB-to-TTL adapter
   - Capture boot logs + serial output

2. SPI flash dump
   - Identify flash chip (usually Winbond/GigaDevice)
   - Connect SOIC8 clip + CH341A programmer
   - Dump firmware
   - Extract strings, keys, endpoints

3. Firmware analysis
   - strings firmware.bin | grep -iE "http|api|key|cert|rsa|aes"
   - binwalk -e firmware.bin
   - Ghidra/IDA for ARM/Thumb disassembly
```

---

## Phase 3: Phone ↔ Terminal Protocol Capture

### NFC Card Emulation Capture

```
Phone Side (rooted Android):
1. Install card emulation app (or use Revolut/Pay app)
2. Hook HCE service:
   frida -U -f com.revolut.revolut -l frida/hce_hooks.js

hce_hooks.js:
  Java.perform(function() {
    var HceService = Java.use("android.nfc.cardemulation.HostApduService");
    HceService.processCommandApdu.implementation = function(apdu, extras) {
      console.log("[HCE APDU IN] " + bytesToHex(apdu));
      var response = this.processCommandApdu(apdu, extras);
      console.log("[HCE APDU OUT] " + bytesToHex(response));
      return response;
    };
  });

Terminal Side:
- Place phone on terminal
- Terminal sends SELECT PPSE → SELECT AID → GET PROCESSING OPTIONS
- Phone responds with card data (PAN, expiry, etc.)
- Full EMV flow captured in frida_console.log
```

### Bluetooth Transaction Capture

```
Phone Side:
1. Enable Bluetooth HCI snoop log:
   Settings → Developer Options → Enable Bluetooth HCI snoop log
2. Perform transaction
3. Pull log:
   adb pull /sdcard/btsnoop_hci.log
4. Open in Wireshark → extract SPP/RFCOMM data

Terminal Side (if Android):
1. Same HCI snoop on terminal
2. Cross-reference both sides of Bluetooth communication
```

---

## Phase 4: The Orchestrator Architecture

```
afiliators-orchestrator/
├── orchestrator.py              # Main controller
├── devices/
│   ├── phone_controller.py      # ADB + Frida phone automation
│   ├── terminal_controller.py   # Terminal interaction (serial/BT/ADB)
│   └── nfc_relay.py             # NFC proxy/relay between devices
├── capture/
│   ├── phone_capture.py         # mitmproxy + Frida on phone
│   ├── terminal_capture.py      # Serial/UART capture
│   └── nfc_capture.py           # Proxmark3 / NFC sniffer
├── terminals/
│   ├── stone/
│   │   ├── research.md          # Stone-specific findings
│   │   ├── endpoints.json       # API endpoints
│   │   └── protocol.md          # Phone↔Terminal protocol
│   ├── mercadopago/
│   │   ├── research.md
│   │   ├── endpoints.json
│   │   └── protocol.md
│   ├── pagseguro/
│   │   └── ...
│   ├── cielo/
│   │   └── ...
│   ├── getnet/
│   │   └── ...
│   ├── rede/
│   │   └── ...
│   └── sumup/
│       └── ...
├── analysis/
│   ├── emv_parser.py            # EMV transaction data parser
│   ├── nfc_decoder.py           # ISO 14443/7816 decoder
│   └── transaction_replay.py   # Replay captured transactions
├── sessions/
│   └── YYYY-MM-DD_HHMMSS_terminal-brand/
│       ├── phone_flows.jsonl
│       ├── terminal_log.txt
│       ├── nfc_dump.bin
│       └── transaction.json
└── hardware/
    ├── proxmark3_setup.md       # NFC sniffing hardware
    ├── uart_adapter.md          # USB-to-TTL setup
    └── relay_attack.md          # NFC relay attack setup
```

---

## Phase 5: Transaction Automation Flow

```
1. ORCHESTRATOR STARTS
   ├── Phone: Launch payment app + Frida
   ├── Phone: Start mitmproxy capture
   ├── Terminal: Boot (if Android) or power on
   │
2. PAIRING
   ├── Phone: Scan for terminal Bluetooth
   ├── Phone: Select terminal → pair
   ├── Capture: Bluetooth SPP key exchange
   │
3. CARD REGISTRATION (NFC)
   ├── Phone: Open card registration screen
   ├── Phone: Present to terminal NFC reader
   ├── Terminal: Reads card data via EMV
   ├── Capture: Full EMV SELECT/READ RECORD sequence
   ├── Capture: Card tokenization request to cloud
   │
4. TRANSACTION
   ├── Phone: Enter amount
   ├── Phone: Select payment method (credit/debit)
   ├── Phone: Present to terminal
   ├── Terminal: Contactless EMV transaction
   │   ├── SELECT PPSE
   │   ├── SELECT AID (Visa/Mastercard/ELO)
   │   ├── GET PROCESSING OPTIONS (PDOL)
   │   ├── READ RECORD (track data)
   │   ├── GENERATE AC (cryptogram)
   │   └── Issuer auth → approval
   ├── Capture: Complete EMV flow
   ├── Capture: Authorization API call
   │
5. RESULT
   ├── Terminal: Print receipt
   ├── Phone: Show transaction confirmation
   ├── Capture: Receipt data + confirmation API
   │
6. ORCHESTRATOR STOPS
   ├── Save all session data
   ├── Generate flow diagram
   ├── Extract unique API endpoints
   └── Compare with known endpoints (diff)
```

---

## Reference Links

### Payment Terminal Research
- Stone Developers: https://developers.stone.com.br/
- Mercado Pago Developers: https://www.mercadopago.com.br/developers/
- PagSeguro API: https://dev.pagseguro.uol.com.br/
- Cielo Developers: https://developer.cielo.com.br/
- Getnet API: https://developers.getnet.com.br/
- SumUp API: https://developer.sumup.com/

### NFC / EMV
- EMV Book 1-4 (contact/contactless spec): https://www.emvco.com/specifications/
- Android HCE: https://developer.android.com/develop/connectivity/nfc/hce
- Proxmark3: https://github.com/RfidResearchGroup/proxmark3
- NFC Tools: https://www.wakdev.com/en/apps/nfc-tools.html

### Hardware Tools
- CH341A programmer (SPI flash dump): ~$5 on AliExpress
- USB-to-TTL adapter (UART): CP2102 or FT232RL
- Proxmark3 Easy (NFC/RFID): ~$40 on AliExpress
- SOIC8 test clip: For reading flash chips without desoldering

### Terminal Teardowns
- iFixit / YouTube tear down guides for each model
- FCC ID photos (search FCC ID on terminal label)
- Anatel (Brazil) certification photos

---

## Next Steps (Future)

1. Acquire one terminal of each major brand
2. Teardown + identify debugging interfaces (UART, JTAG, USB)
3. For Android terminals: root + extract APK + Frida
4. For proprietary terminals: flash dump + firmware analysis
5. Build phone automation scripts (ADB + Frida for each payment app)
6. Build the orchestrator to run full automated flows
7. Document the phone↔terminal protocol for each brand
8. Implement transaction replay for testing
