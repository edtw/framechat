# HANDOFF TO ROOT CLAUDE — Redmi Note 12S Recovery

**Date**: 2026-06-05  
**Device**: Redmi Note 12S (sea/sea_global), MT6781 Helio G96, UFS 128GB  
**State**: Bricked — "system has been destroyed"

---

## DEVICE IDENTITY (Verified from Device)

- **Model**: 2303ERA42L | Codename: `sea` (board: `ocean`)
- **Firmware**: **OS2.0.208.0.VHZMIXM** (HyperOS 2, Android 15, Global)
- **Fingerprint**: `Redmi/sea_global/sea:15/AP3A.240905.015.A2/OS2.0.208.0.VHZMIXM:user/release-keys`
- **Kernel**: 4.19.191 | **Bootloader**: LOCKED | **Slots**: A/B (active: b)
- **Source of truth**: `check_device.sh` read boot_a from device → extracted version string

## WHAT WENT WRONG

1. Flashed GitHub boot.img (OS2.0.2.0.VHZMIXM) to boot_b — wrong version, bootlooped
2. Read boot_b (corrupted) thinking it was original
3. Flashed that corrupted image around multiple times
4. Wrote 4MB zero to misc (512KB partition) — likely overflowed into adjacent partitions
5. Never restored system/vendor partitions — dm-verity still failing

## CURRENT BEHAVIOR
After misc clear + factory boot/vbmeta restore: 
- **White screen** (kernel loads!) → black → "system has been destroyed"
- Progress: bootloader accepts boot/vbmeta → kernel loads → dm-verity on system FAILS

## FILES — Quick Reference

### GOOD (Use These)
| File | MD5 | Source |
|---|---|---|
| `boot_stock_real.img` (64MB) | `05073b20d349a7ca3457dd534ccf11bc` | Factory boot_a |
| `vbmeta_a.img` (8MB) | `406871f415fea497a641ebf36499cb14` | Factory vbmeta_a |

### Toolkit
- mtkclient: `POVMACHINE/mtkclient/mtk.py`
- Python: `.venv/bin/python3`
- Env: `export DYLD_LIBRARY_PATH="/opt/homebrew/opt/expat/lib:$DYLD_LIBRARY_PATH"`
- All commands: `sudo -E .../python3 .../mtk.py <cmd> <part> <file>`

### Key Scripts
| Script | Purpose |
|---|---|
| `check_device.sh` | Read boot_a + vbmeta_a + seccfg + GPT from device |
| `flash_factory.sh` | Write boot+vbmeta from factory images to both slots |
| `verify_flash_integrity.sh` | Write+readback+hash verify on boot_a |

## PARTITION MAP
| Partition | Sector | Sectors | Size |
|---|---|---|---|
| misc | 8 | 128 | 512KB ← WE WROTE 4MB HERE |
| vbmeta_a | 599304 | 2048 | 8MB |
| vbmeta_b | 605448 | 2048 | 8MB |
| boot_a | 708352 | 16384 | 64MB |
| boot_b | 833280 | 16384 | 64MB |

## WHAT ROOT CLAUDE MUST DO

### Step 1: Verify firmware download
```bash
ls -lh firmware.tgz  # Should be ~6.93GB
gunzip -t firmware.tgz  # Must pass: "gzip OK"
```
If corrupt: delete and redownload from:
`https://bigota.d.miui.com/OS2.0.208.0.VHZMIXM/sea_global_images_OS2.0.208.0.VHZMIXM_20251201.0000.00_15.0_global_bdf00d0e1f.tgz`

### Step 2: Extract boot + vbmeta from firmware
Compare with our factory dumps. If hashes match → our dumps are clean.

### Step 3: Read full GPT
```bash
sudo -E python3 mtk.py printgpt
```
Discover ALL partitions — especially: `vbmeta_system_a/b`, `vbmeta_vendor_a/b`, `dtbo_a/b`, `lk_a/b`, `preloader_a/b`, `tee_a/b`, `param`, `persist`, `nvdata`

### Step 4: Check misc overflow damage
Read partitions immediately after misc (check GPT for sector 8+128=136). Look for unexpected zeroed bytes.

### Step 5: Flash ALL critical partitions from firmware
- preloader, lk, tee (both slots)
- dtbo (both slots)
- boot, vbmeta (both slots)
- vbmeta_system, vbmeta_vendor (both slots if exist)
- misc (CORRECT size: 512KB zeroed)

### Step 6: Reboot and test

### If still failing: RPMB rollback
The anti-rollback counter is in hardware TEE — cannot reset via mtkclient. Options:
- Paid tools: UnlockTool, Pandora Box, DFT Tool (~$30-50)
- Xiaomi authorized service center
- Find TEE exploit for MT6781
- ISP/JTAG direct UFS access

## BROM MODE ENTRY
1. Power off (hold Power 10+ seconds)
2. Hold Vol+ AND Vol- together
3. Plug USB while holding
4. Release after 2 seconds
5. mtkclient auto-detects

---

**Firmware download status**: Check with `ls -lh firmware.tgz`
**Expected MD5**: `bdf00d0e1ff79f06c7d5162a59974cec`
