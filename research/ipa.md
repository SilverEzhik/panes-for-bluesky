# Original 2010 Twitter for iPad application

Retrieved and verified on 2026-10-15. These are actual IPA ZIP packages containing the original universal Twitter app, Mach-O executable, Info.plist, nib resources, and Apple CgBI PNG artwork. The preservation copies have third-party decryption/repackaging indicators; they are not represented as pristine App Store signed downloads.

## Primary reference: Twitter 3.1.1

- Local package: `research/original-app/Twitter-3.1.1.ipa` (2,748,346 bytes).
- [Direct preserved package](https://archive.org/download/marcoalimaiosappcollection/Twitter.v3.1.1.iPhone-C4iD.ipa).
- [Archive item](https://archive.org/details/marcoalimaiosappcollection), discovered through [IPA archive index](https://github.com/ipaarchive/ipaarchive.github.io/blob/main/data/ipa.json).
- SHA-256: `605d2192d883d1c9f7a44969da827db951d567b783f0d41bbc877412e817b581`.
- MD5: `e6be126ae0d1fdcf2fdba3245a3dc03d` (matches Internet Archive file metadata).
- Info.plist: `CFBundleIdentifier=com.atebits.Tweetie2`, `CFBundleVersion=3.1.1`, `UIDeviceFamily=[1,2]`, `MinimumOSVersion=3.1`, `DTSDKName=iphoneos4.0`.
- Most ZIP entries dated 2010-09-02. Archive source mtime 2010-09-14. ZIP dates and iTunes purchase dates can be modified and are supporting evidence only.
- Extracted tree: `research/original-app/Twitter-3.1.1/`.
- Executable: `research/original-app/Twitter-3.1.1/Payload/Twitter.app/Twitter`.
- 265 original PNG assets, including 36 names beginning `iPad-`; 265 browser-compatible decoded copies in `public/assets/original/`.
- The package's `iTunesMetadata.plist` release date is the original app's 2009-10-09 date, not this version's release date. Do not infer the iPad design's age from that field.

Twitter's [September 2, 2010 launch announcement](https://blog.x.com/en_us/a/2010/twitter-for-ipad-sharing-content-in-tweets) documents the sliding panes, pinch for tweet details, and two-finger downward conversation reveal. [O'Reilly's Best iPad Apps](https://www.oreilly.com/library/view/best-ipad-apps/9781449397531/ch02s06.html) specifically names version 3.1.1 and describes its timeline and linked-page columns as stacked movable cards.

Version boundary: the firsthand [MacStories launch review](https://www.macstories.net/ipad/twitter-for-ipad-review/) calls the launch update **3.1**. Launch-day visual references are not proven captures of this 3.1.1 executable. The included `C4iD.nfo` identifies a third-party 3.1.1 release dated 2010-09-08; that is packager metadata, not an authenticated App Store release date. Native findings apply to the preserved 3.1.1 bytes unless separately corroborated for another version. See `critiques/astra-historical-audit.md` for the independent provenance audit.

## Secondary reference: Twitter 3.2.1

- Local package: `research/original-app/Twitter-3.2.1.ipa` (2,972,290 bytes).
- [Direct preserved package](https://archive.org/download/ios-ipa-collection/Twitter%203.2.1.ipa).
- [Archive item](https://archive.org/details/ios-ipa-collection).
- SHA-256: `49946b30f44242c405c6a5376412ea74049024485fd6cd7ff1245e4c0854412a`.
- MD5: `5505af2a724e32cda37b9e2130224984` (matches Internet Archive file metadata).
- Info.plist: `CFBundleIdentifier=com.atebits.Tweetie2`, `CFBundleVersion=3.2.1`, `UIDeviceFamily=[1,2]`, `MinimumOSVersion=3.1`, `DTSDKName=iphoneos4.2`.
- Most ZIP entries dated 2010-11-17.
- Extracted tree: `research/original-app/Twitter-3.2.1/`.
- Contains 298 PNG assets. Not mixed into the primary app assets.
- A [November 17, 2010 contemporaneous report](https://iphonesoft.fr/2010/11/17/mise-a-jour-de-twitter-iphone-v32) identifies 3.2 and its 3.2.1 iTunes URL fix.

## Decoding and provenance

`research/original-app/decode-assets.py` is a dependency-free reproducible decoder. It reads the 3.1.1 originals, inflates Apple's raw DEFLATE PNG payloads, reverses PNG scanline filters, swaps BGRA to RGBA, unpremultiplies alpha, and emits standard browser PNGs. The original files remain intact. Run:

```sh
python3 research/original-app/decode-assets.py
```

`research/original-app/asset-manifest.json` records every filename, pixel dimensions, source SHA-256, output SHA-256, and whether CgBI decoding was required. `*.ipa.source.json` contains the selected Internet Archive metadata and download URL. Inspected the decoded sidebar texture with the image viewer; it renders as the expected charcoal textured gradient.

These original third-party assets are retained for the user-requested historical reconstruction; provenance is recorded and no separate asset license is asserted.
