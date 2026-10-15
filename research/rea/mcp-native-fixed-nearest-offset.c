
/* Function Stack Size: 0x14 bytes */

int __ABSwipeColumnViewController_nearestOffsetForPossibleOffsets_fromOffset_toOffset__
              (ID param_1,SEL param_2,ID param_3,int param_4,int param_5)

{
  ID IVar1;
  int iVar2;
  uint uVar3;
  uint uVar4;
  uint uVar5;
  int local_8c;
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
    local_78 = 0xffffffff;
  }
  else {
    local_78 = 0xffffffff;
    iVar2 = *local_6c;
    uVar4 = 0x7fffffff;
    do {
      uVar5 = 0;
      do {
        if (iVar2 != *local_6c) {
          _objc_enumerationMutation(param_3);
        }
        IVar1 = _objc_msgSend(*(ID *)(local_70 + uVar5 * 4),"intValue");
        uVar3 = (int)(IVar1 - param_5) >> 0x1f;
        uVar3 = (IVar1 - param_5) + uVar3 ^ uVar3;
        if ((int)uVar4 <= (int)uVar3) {
          uVar3 = uVar4;
          IVar1 = local_78;
        }
        local_78 = IVar1;
        uVar4 = uVar3;
        uVar5 = uVar5 + 1;
      } while (uVar5 < local_80);
      local_80 = _objc_msgSend(param_3,"countByEnumeratingWithState:objects:count:",&local_74,
                               auStack_54,0x10);
    } while (local_80 != 0);
  }
  local_8c = param_4;
  if (local_78 != 0xffffffff) {
    local_8c = local_78;
  }
  return local_8c;
}

