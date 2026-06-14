# AFILIATORS — Master Reference

**Last updated**: 2026-06-05  
**Project**: Revolut APK reverse engineering + Android device rooting  
**Device**: Redmi Note 12S (sea/sea_global), MT6781 Helio G96

---

## 1. PROJECT OVERVIEW

We are reverse engineering the Revolut Android app to analyze:
- Registration/invite API endpoints
- SSL pinning mechanisms
- Security architecture
- Business logic vulnerabilities
- Payment terminal orchestration

### Key Files
```
/Users/eto/Documents/AFILIATORS/
├── apk/                       # Revolut APK files (base.apk + splits)
├── apk_decompiled/            # jadx output (182K Java files)
├── docs/                      # Documentation
│   ├── static-analysis.md     # APK decompilation report
│   ├── api-surface.md         # All API endpoints found
│   ├── referral-system.md     # Referral/invite analysis
│   ├── attack-vectors.md      # 17 vulnerability vectors
│   ├── security-architecture.md # 6-layer security stack
│   ├── reverse-engineering-guide.md # Agent handbook
│   ├── payment-orchestration-masterplan.md # POS terminal plan
│   ├── recovery-state.md      # Device recovery state
│   ├── ROOT_CLAUDE_HANDOFF.md # Quick start for new session
│   └── MASTER_REFERENCE.md    # This file
├── firmware_images/           # Extracted OTA images for flashing
├── frida/                     # Frida hook scripts
├── static/                    # Static analysis Python scripts
├── .venv/                     # Python venv (frida, objection, mitmproxy, etc.)
└── POVMACHINE/mtkclient/      # mtkclient tool for MediaTek flash
```

---

## 2. DEVICE IDENTITY (VERIFIED FROM DEVICE via BROM)

| Field | Value |
|---|---|
| **Model** | Redmi Note 12S (2303ERA42L) |
| **Codename** | `sea` (board: `ocean`) |
| **SoC** | MediaTek MT6781 (Helio G96) |
| **UFS Storage** | Samsung KM8F9001JM-B81 (128GB) |
| **Firmware** | **OS2.0.208.0.VHZMIXM** ⇐ VERIFIED from boot_a |
| **Android** | 15 / HyperOS 2 |
| **Fingerprint** | `Redmi/sea_global/sea:15/AP3A.240905.015.A2/OS2.0.208.0.VHZMIXM:user/release-keys` |
| **Kernel** | 4.19.191 |
| **Bootloader** | LOCKED |
| **Slots** | A/B (active: b) |

**⚠️ Critical**: The firmware version is **OS2.0.208.0** (NOT .212.0, NOT .2.0). We confirmed this by reading boot_a from the device via BROM mode and extracting the build fingerprint.

---

## 3. WHAT WENT WRONG (Chronology)

### How the device got bricked:

1. **Initial state**: Device working on OS2.0.208.0.VHZMIXM, bootloader locked
2. **Wrong boot flash**: Flashed GitHub boot.img from OS2.0.2.0.VHZMIXM to boot_b via mtkclient
   - This is a DIFFERENT version → AVB hash mismatch → boot_b fails
3. **Slot A still worked**: Device booted from slot A successfully after this
4. **The critical mistake**: When we went to BROM to extract "original boot":
   - Read boot_b (which had the WRONG GitHub boot) thinking it was original
   - Read vbmeta_b — later discovered this was CORRUPTED
5. **More wrong flashes**: Flashed the corrupted boot/vbmeta around multiple times
6. **4MB misc overflow**: Wrote a 4MB zero file to the misc partition which is only 512KB
   - Likely overflowed into adjacent partitions (param/persist/nvdata/etc.)
7. **Wrong firmware download**: Spent hours downloading OS2.0.212.0 (wrong version from web search)
8. **Right firmware found**: Used `check_device.sh` to read boot_a from device → confirmed OS2.0.208.0
9. **Chrome download succeeded**: Downloaded via mifirm.net — ZIP verified, payload.bin extracted

### Current device behavior:
- White screen → black → "system has been destroyed"
- The kernel **LOADS** (white screen = boot animation starts)
- Then crashes (black) → system verification fails → "destroyed" message
- Root cause: **dm-verity on system partition failing** — we never restored system + vbmeta_system

---

## 4. IMAGE FILES — Inventory

### GOOD ✅ (Use These)
| File | Size | MD5 | Source |
|---|---|---|---|
| `firmware_images/boot.img` | 64MB | `05073b20d349a7ca3457dd534ccf11bc` | Official OTA OS2.0.208.0 |
| `firmware_images/lk.img` | 1.2MB | — | Official OTA |
| `firmware_images/tee.img` | 2.5MB | — | Official OTA |
| `firmware_images/dtbo.img` | 8MB | — | Official OTA |
| `firmware_images/preloader_raw.img` | 336KB | — | Official OTA |
| `firmware_images/vbmeta_full.img` | 8MB (padded) | — | Official OTA + padding |
| `firmware_images/vbmeta_system.img` | 4KB | — | Official OTA |
| `firmware_images/system.img` | 882MB | — | Official OTA |
| `firmware_images/vendor.img` | 512MB | — | Official OTA |
| `boot_stock_real.img` | 64MB | `05073b20` | Same as boot.img (CONFIRMED MATCH!) |
| `vbmeta_a.img` | 8MB | `406871f4` | Factory vbmeta_a from device |

### BAD ❌ (DO NOT USE)
| File | Why |
|---|---|
| `vbmeta_your.img` | Corrupted — from vbmeta_b after wrong flash |
| `vbmeta_patched.img` | Invalid — hand-crafted, not signed |
| `boot_your.img` | Wrong version — GitHub OS2.0.2.0 |
| Any `magisk_patched.img` | Patched from wrong base boot |

---

## 5. PARTITION MAP (from mtkclient GPT)

| Partition | Start Sector | Count | Size |
|---|---|---|---|
| misc | 8 | 128 | 512KB ⚠️ WE WROTE 4MB |
| vbmeta_a | 599304 | 2048 | 8MB |
| vbmeta_b | 605448 | 2048 | 8MB |
| boot_a | 708352 | 16384 | 64MB |
| boot_b | 833280 | 16384 | 64MB |
| + Many more | See `printgpt` output | | |

---

## 6. HOW TO FIX THE DEVICE

### Prerequisites
- `firmware_images/` with all extracted images from payload.bin ✅ DONE
- mtkclient accessible ✅ DONE
- Device can enter BROM mode ✅ DONE

### Step 1: Flash ALL critical partitions
```bash
cd /Users/eto/Documents/AFILIATORS
bash flash_final_fix.sh
```
This flashes: preloader, lk, tee, dtbo, boot, vbmeta, vbmeta_system, vbmeta_vendor, gz (both A/B slots), and misc (correct 512KB).

### Step 2: Reboot
Hold Power 15 seconds. If it boots — DONE.

### Step 3: If still failing — flash system+vendor
```bash
# Flash system and vendor from OTA (these are HUGE — 882MB+512MB)
sudo -E .venv/bin/python3 POVMACHINE/mtkclient/mtk.py w system_a firmware_images/system.img
# ... etc
```

### Step 4: If STILL failing — RPMB rollback
The anti-rollback counter is in hardware TEE. Cannot be reset via mtkclient.
Options:
- Paid tools: UnlockTool, Pandora Box (~$30-50)
- Xiaomi Mi Service Center
- Find TEE exploit for MT6781

---

## 7. HOW TO ROOT AFTER RECOVERY

Once device boots:
1. Push `boot_stock_real.img` to device → Magisk patch → pull patched image
2. Read `vbmeta_a` from device → patch with avbtool to disable verification
3. Flash both via mtkclient (same as we've been doing)
4. Install Shamiko + enable DenyList (hide root from Revolut/banks)
5. Push frida-server to device

---

## 8. COMMANDS CHEAT SHEET

### Enter BROM Mode
```
1. Power off device (hold Power 10+ seconds)
2. Hold Volume Up + Volume Down together
3. Plug USB cable while holding
4. Release after 2 seconds
```

### Read all device info
```bash
bash check_device.sh
```

### Full factory restore
```bash
bash flash_final_fix.sh
```

### Read/Vbmeta from device
```bash
bash read_boot_a.sh    # Read boot_a → boot_stock_real.img
bash read_vbmeta_a.sh  # Read vbmeta_a → vbmeta_a.img
```

### mtkclient manual command
```bash
export DYLD_LIBRARY_PATH="/opt/homebrew/opt/expat/lib:$DYLD_LIBRARY_PATH"
sudo -E .venv/bin/python3 POVMACHINE/mtkclient/mtk.py <cmd> <partition> <file>
# cmd: r=read, w=write, printgpt=list partitions
```

### Verify firmware version on device
```bash
strings /tmp/boot_check.img | grep -oE 'OS[0-9].[0-9.]+.[0-9.]+.[A-Z]+' | sort -u
```

---

## 9. KNOWN GOTCHAS

1. **Xiaomi bigota server throttles** — downloads stall at 6.5GB. Use Chrome + mifirm.net instead of aria2c/curl.
2. **macOS needs sudo** for mtkclient — USB device access requires root.
3. **`install_non_market_apps` may timeout** — Xiaomi has aggressive install confirmation popup. Keep screen ON and unlocked.
4. **misc partition is 512KB** — do NOT write anything larger. Check partition sizes before flashing.
5. **vbmeta from OTA is 8KB** — partition is 8MB. Pad with zeros to fill.
6. **A/B slot confusion** — always flash both _a and _b to be safe.
7. **GitHub boot.img is OS2.0.2.0** — MUCH older than device's OS2.0.208.0. Never use it on this device.
8. **Never trust web search for firmware version** — always extract from device boot partition.

---

## 10. FOR THE NEXT CLAUDE SESSION

### Quick start:
```bash
cd /Users/eto/Documents/AFILIATORS
cat docs/MASTER_REFERENCE.md  # Read this first
bash check_device.sh           # Verify device state
bash flash_final_fix.sh        # Fix the device
```

### Key facts to know:
- Firmware: **OS2.0.208.0.VHZMIXM** (not .212, not .2.0)
- Boot/vbmeta are FACTORY images — matched to OTA (MD5 confirmed)
- Device shows white screen → kernel loads → dm-verity fails
- Fix: flash vbmeta_system + full boot chain from OTA
- mtkclient WORKS — bypasses DAA/SLA every time
- Bootloader is LOCKED — cannot use fastboot flash
- macOS needs `sudo` for mtkclient

### If the device still fails after flash_final_fix.sh:
- RPMB rollback protection in hardware TEE is the likely cause
- Paid tools or Xiaomi service center are the only remaining options
