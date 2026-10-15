
/* WARNING: Restarted to delay deadcode elimination for space: stack */
/* Function Stack Size: 0xc bytes */

void __ABSwipeColumnViewController__updateLayout__(ID param_1,SEL param_2,char param_3)

{
  byte bVar1;
  ID IVar2;
  ID IVar3;
  int iVar4;
  ID IVar5;
  ID IVar6;
  undefined4 uVar7;
  undefined4 uVar8;
  int iVar9;
  int iVar10;
  int iVar11;
  cfstringStruct *pcVar12;
  uint uVar13;
  ID IVar14;
  undefined4 uVar15;
  uint local_12c;
  uint local_120;
  undefined4 local_11c;
  int local_118;
  uint local_108;
  uint local_100;
  undefined4 local_fc [2];
  undefined auStack_f4 [8];
  undefined4 local_ec;
  undefined4 local_e8;
  undefined auStack_e4 [12];
  undefined4 local_d8;
  undefined4 local_d4;
  int local_d0;
  int *local_cc;
  undefined4 local_c8;
  undefined4 local_c4;
  undefined4 local_c0;
  undefined4 local_bc;
  undefined4 local_b8;
  undefined1 auStack_b4 [64];
  undefined4 local_74;
  int local_70;
  int *local_6c;
  undefined4 local_68;
  undefined4 local_64;
  undefined4 local_60;
  undefined4 local_5c;
  undefined4 local_58;
  undefined1 auStack_54 [64];
  
  IVar2 = _objc_msgSend(param_1,"view");
  _objc_msgSend_stret(auStack_f4,IVar2,"bounds");
  _objc_msgSend_stret(auStack_e4,*(ID *)(ABSwipeColumnViewController::_scrollView + param_1),"frame"
                     );
  local_e8 = local_d8;
  IVar2 = _objc_msgSend(*(ID *)(ABSwipeColumnViewController::viewControllers + param_1),"count");
  _objc_msgSend_stret((undefined *)local_fc,
                      *(ID *)(ABSwipeColumnViewController::_scrollView + param_1),"contentOffset");
  local_d4 = 0;
  local_d0 = 0;
  local_cc = (int *)0x0;
  local_c8 = 0;
  local_c4 = 0;
  local_c0 = 0;
  local_bc = 0;
  local_b8 = 0;
  IVar3 = *(ID *)(ABSwipeColumnViewController::viewControllers + param_1);
  local_12c = _objc_msgSend(IVar3,"countByEnumeratingWithState:objects:count:",&local_d4,auStack_b4,
                            0x10);
  if (local_12c == 0) {
    local_11c = 0;
    local_120 = 0;
  }
  else {
    iVar11 = *local_cc;
    local_100 = 0;
    local_118 = 0;
    local_120 = 0;
    do {
      if (local_12c < 2) {
        local_12c = 1;
      }
      local_108 = 0;
      do {
        iVar4 = local_108 + local_118;
        if (iVar11 != *local_cc) {
          _objc_enumerationMutation
                    (*(undefined4 *)(ABSwipeColumnViewController::viewControllers + param_1));
        }
        IVar5 = *(ID *)(local_d0 + local_108 * 4);
        IVar6 = _objc_msgSend(IVar5,"ab_swipeColumnWidth:",
                              *(undefined4 *)
                               (ABSwipeColumnViewController::currentOrientation + param_1));
        local_11c = ___addsf3vfp(local_100);
        uVar15 = local_e8;
        uVar13 = local_fc[0];
        if ((iVar4 != 0) && ((uVar13 = local_100, IVar2 != 2 || (iVar4 != 1)))) {
          uVar8 = ___addsf3vfp(local_100,0xc2900000);
          uVar7 = local_fc[0];
          iVar9 = ___gtsf2vfp(uVar8,local_fc[0]);
          iVar10 = ___unordsf2vfp(uVar8,uVar7);
          if (iVar10 == 0 && iVar9 == 0) {
            local_120 = local_108 + local_118;
            uVar13 = ___addsf3vfp(uVar7,0x42900000);
          }
        }
        local_100 = uVar13;
        if (iVar4 == IVar2 - 1) {
          IVar14 = *(ID *)(ABSwipeColumnViewController::otherSidebarShadow + param_1);
          uVar7 = ___addsf3vfp(local_100,IVar6);
          uVar8 = ___addsf3vfp(uVar7,0xc0a00000);
          _objc_msgSend(IVar14,"setFrame:",uVar8,0,0x42240000,uVar15);
          IVar14 = _objc_msgSend(*(ID *)(ABSwipeColumnViewController::_pullTab + param_1),"isHidden"
                                );
          if ((IVar14 & 0xff) == 0) {
            uVar7 = ___subsf3vfp(uVar7,local_fc[0]);
            uVar8 = ___addsf3vfp(local_ec,0);
            iVar9 = ___lesf2vfp(uVar7,uVar8);
            iVar10 = ___unordsf2vfp(uVar7,uVar8);
            uVar7 = ___addsf3vfp(local_100,0xc22c0000);
            uVar7 = ___addsf3vfp(uVar7,0x3f800000);
            uVar13 = ___addsf3vfp(uVar7,0x40400000);
            if (iVar10 != 0 || iVar9 != 0) {
              uVar7 = 0xbf800000;
              goto LAB_0009c22c;
            }
            IVar14 = *(ID *)(ABSwipeColumnViewController::_pullTab + param_1);
            uVar7 = ___addsf3vfp(uVar13,0x42480000);
            uVar7 = ___addsf3vfp(uVar7,0xc0400000);
          }
          else {
            uVar7 = 0x42c80000;
            uVar13 = local_100;
LAB_0009c22c:
            uVar7 = ___addsf3vfp(uVar13,uVar7);
            IVar14 = *(ID *)(ABSwipeColumnViewController::_pullTab + param_1);
          }
          _objc_msgSend(IVar14,"setFrame:",uVar7,0x43480000,0x422c0000,0x43160000);
        }
        if (iVar4 == 1) {
          uVar7 = ___addsf3vfp(local_100,0xc2100000);
          _objc_msgSend(*(ID *)(ABSwipeColumnViewController::sidebarShadow + param_1),"setFrame:",
                        uVar7,0,0x42240000,local_e8);
        }
        IVar5 = _objc_msgSend(IVar5,"view");
        _objc_msgSend(IVar5,"setFrame:",local_100,0,IVar6,uVar15);
        local_108 = local_108 + 1;
        local_100 = local_11c;
      } while (local_108 != local_12c);
      IVar5 = _objc_msgSend(IVar3,"countByEnumeratingWithState:objects:count:",&local_d4,auStack_b4,
                            0x10,uVar15);
      local_118 = local_118 + local_12c;
      local_12c = IVar5;
    } while (IVar5 != 0);
  }
  local_74 = 0;
  local_70 = 0;
  local_6c = (int *)0x0;
  local_68 = 0;
  local_64 = 0;
  local_60 = 0;
  local_5c = 0;
  local_58 = 0;
  IVar2 = *(ID *)(ABSwipeColumnViewController::viewControllers + param_1);
  uVar15 = 0x10;
  local_100 = _objc_msgSend(IVar2,"countByEnumeratingWithState:objects:count:",&local_74,auStack_54,
                            0x10);
  if (local_100 != 0) {
    iVar11 = *local_6c;
    local_108 = 0;
    do {
      if (local_100 < 2) {
        local_100 = 1;
      }
      uVar13 = 0;
      do {
        if (iVar11 != *local_6c) {
          _objc_enumerationMutation
                    (*(undefined4 *)(ABSwipeColumnViewController::viewControllers + param_1));
        }
        if (uVar13 + local_108 != 0) {
          IVar3 = _objc_msgSend(*(ID *)(local_70 + uVar13 * 4),"view");
          _objc_msgSend(IVar3,"setHidden:",(uint)((int)(uVar13 + local_108) < (int)local_120));
        }
        uVar13 = uVar13 + 1;
      } while (uVar13 != local_100);
      uVar15 = 0x10;
      IVar3 = _objc_msgSend(IVar2,"countByEnumeratingWithState:objects:count:",&local_74,auStack_54,
                            0x10);
      local_108 = local_108 + local_100;
      local_100 = IVar3;
    } while (IVar3 != 0);
  }
  if (local_120 == 2) {
    bVar1 = 1;
  }
  else if (local_120 < 2) {
    bVar1 = 0;
  }
  else {
    bVar1 = 2;
  }
  if (bVar1 != (*(byte *)(ABSwipeColumnViewController::_flags + param_1) >> 2 & 7)) {
    *(byte *)(ABSwipeColumnViewController::_flags + param_1) =
         bVar1 << 2 | *(byte *)(ABSwipeColumnViewController::_flags + param_1) & 0xe3;
    if (bVar1 == 1) {
      pcVar12 = &cf_iPad_sidebar_shadow_1_png;
    }
    else if (bVar1 == 2) {
      pcVar12 = &cf_iPad_sidebar_shadow_2_png;
    }
    else {
      pcVar12 = &cf_iPad_sidebar_shadow_png;
    }
    IVar2 = UIImage::imageNamed_((ID)&_OBJC_CLASS___UIImage,"imageNamed:",pcVar12);
    IVar2 = UIImage::stretchableImageWithLeftCapWidth_topCapHeight_
                      (IVar2,"stretchableImageWithLeftCapWidth:topCapHeight:",0,0x29);
    _objc_msgSend(*(ID *)(ABSwipeColumnViewController::sidebarShadow + param_1),"setImage:",IVar2);
  }
  if (param_3 != '\0') {
    _objc_msgSend(*(ID *)(ABSwipeColumnViewController::_scrollView + param_1),"setContentSize:",
                  local_11c,local_e8,uVar15);
  }
  return;
}

