
/* Function Stack Size: 0x18 bytes */

int __ABSwipeColumnViewController_bestOffsetForPossibleOffsets_fromOffset_toOffset_inDirection__
              (ID param_1,SEL param_2,ID param_3,int param_4,int param_5,int param_6)

{
  int iVar1;
  ID IVar2;
  int iVar3;
  uint uVar4;
  uint uVar5;
  uint uVar6;
  uint uVar7;
  int local_88;
  int local_84;
  uint local_80;
  int local_78;
  undefined4 local_74;
  int local_70;
  int *local_6c;
  undefined4 local_68;
  undefined4 local_64;
  undefined4 local_60;
  undefined4 local_5c;
  undefined4 local_58;
  undefined1 auStack_54 [64];
  
  local_74 = 0;
  local_70 = 0;
  local_6c = (int *)0x0;
  local_68 = 0;
  local_64 = 0;
  local_60 = 0;
  local_5c = 0;
  local_58 = 0;
  local_80 = _objc_msgSend(param_3,"countByEnumeratingWithState:objects:count:",&local_74,auStack_54
                           ,0x10);
  if (local_80 == 0) {
    local_84 = 0xffffffff;
    local_88 = 0xffffffff;
  }
  else {
    local_84 = 0xffffffff;
    iVar3 = *local_6c;
    uVar5 = 0x7fffffff;
    local_88 = 0xffffffff;
    uVar6 = 0x7fffffff;
    do {
      uVar7 = 0;
      do {
        if (iVar3 != *local_6c) {
          _objc_enumerationMutation(param_3);
        }
        IVar2 = _objc_msgSend(*(ID *)(local_70 + uVar7 * 4),"intValue");
        uVar4 = (int)(IVar2 - param_5) >> 0x1f;
        uVar4 = (IVar2 - param_5) + uVar4 ^ uVar4;
        if ((int)IVar2 < (int)param_4) {
          if ((int)uVar4 < (int)uVar5) {
            uVar5 = uVar4;
            local_84 = IVar2;
          }
        }
        else if (((int)param_4 < (int)IVar2) && ((int)uVar4 < (int)uVar6)) {
          uVar6 = uVar4;
          local_88 = IVar2;
        }
        uVar7 = uVar7 + 1;
      } while (uVar7 < local_80);
      local_80 = _objc_msgSend(param_3,"countByEnumeratingWithState:objects:count:",&local_74,
                               auStack_54,0x10);
    } while (local_80 != 0);
  }
  iVar1 = param_4;
  if (local_84 != 0xffffffff) {
    iVar1 = local_84;
  }
  local_78 = param_4;
  if (local_88 != 0xffffffff) {
    local_78 = local_88;
  }
  if (param_6 != 0) {
    iVar1 = local_78;
  }
  return iVar1;
}

