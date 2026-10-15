
/* Function Stack Size: 0x10 bytes */

ID __ABSwipeColumnViewController_swipePointsForSwipeView_proposedOffset__
             (ID param_1,SEL param_2,ID param_3,float param_4)

{
  ID IVar1;
  ID self;
  ID IVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  ID IVar6;
  uint uVar7;
  int iVar8;
  ID IVar9;
  ID IVar10;
  ID IVar11;
  int local_a0;
  uint local_9c;
  int local_94;
  uint local_8c;
  undefined auStack_84 [8];
  undefined4 local_7c;
  undefined4 local_74;
  int local_70;
  int *local_6c;
  undefined4 local_68;
  undefined4 local_64;
  undefined4 local_60;
  undefined4 local_5c;
  undefined4 local_58;
  undefined1 auStack_54 [64];
  
  IVar1 = _objc_msgSend(*(ID *)(ABSwipeColumnViewController::viewControllers + param_1),"count");
  self = NSMutableArray::arrayWithCapacity_
                   ((ID)&_OBJC_CLASS___NSMutableArray,"arrayWithCapacity:",IVar1 << 1);
  IVar2 = NSNumber::numberWithInt_((ID)&_OBJC_CLASS___NSNumber,"numberWithInt:",0);
  NSMutableArray::addObject_(self,"addObject:",IVar2);
  IVar2 = _objc_msgSend(param_1,"view");
  _objc_msgSend_stret(auStack_84,IVar2,"bounds");
  local_74 = 0;
  local_70 = 0;
  local_6c = (int *)0x0;
  local_68 = 0;
  local_64 = 0;
  local_60 = 0;
  local_5c = 0;
  local_58 = 0;
  IVar2 = *(ID *)(ABSwipeColumnViewController::viewControllers + param_1);
  local_9c = _objc_msgSend(IVar2,"countByEnumeratingWithState:objects:count:",&local_74,auStack_54,
                           0x10);
  if (local_9c != 0) {
    iVar3 = *local_6c;
    iVar4 = ___fixsfsivfp(local_7c);
    local_a0 = 0;
    local_94 = 0;
    do {
      if (local_9c < 2) {
        local_9c = 1;
      }
      local_8c = 0;
      do {
        iVar8 = local_8c + local_a0;
        if (iVar3 != *local_6c) {
          _objc_enumerationMutation
                    (*(undefined4 *)(ABSwipeColumnViewController::viewControllers + param_1));
        }
        _objc_msgSend(*(ID *)(local_70 + local_8c * 4),"ab_swipeColumnWidth:",
                      *(undefined4 *)(ABSwipeColumnViewController::currentOrientation + param_1));
        iVar5 = ___fixsfsivfp();
        if (iVar8 != 0) {
          if (iVar8 == 1) {
            IVar10 = 0;
          }
          else {
            IVar10 = NSNumber::numberWithInt_
                               ((ID)&_OBJC_CLASS___NSNumber,"numberWithInt:",
                                (local_94 - iVar4) + iVar5);
          }
          if (iVar8 == IVar1 - 1) {
            IVar9 = 0;
LAB_0009b84e:
            if ((IVar10 != 0) &&
               (IVar6 = NSMutableArray::containsObject_(self,"containsObject:",IVar10),
               (IVar6 & 0xff) == 0)) {
              NSMutableArray::addObject_(self,"addObject:",IVar10);
            }
            if (IVar9 != 0) {
              uVar7 = NSMutableArray::containsObject_(self,"containsObject:",IVar9);
              IVar10 = IVar9;
joined_r0x0009b940:
              if ((uVar7 & 0xff) == 0) goto LAB_0009b88e;
            }
          }
          else {
            IVar9 = NSNumber::numberWithInt_
                              ((ID)&_OBJC_CLASS___NSNumber,"numberWithInt:",local_94 + -0x48);
            if ((IVar10 == 0) || (IVar9 == 0)) goto LAB_0009b84e;
            IVar11 = *(ID *)(ABSwipeColumnViewController::lastSnapOffset + param_1);
            IVar6 = NSNumber::intValue(IVar10,"intValue");
            if (IVar11 != IVar6) {
              IVar11 = *(ID *)(ABSwipeColumnViewController::lastSnapOffset + param_1);
              IVar6 = NSNumber::intValue(IVar9,"intValue");
              if ((IVar11 != IVar6) &&
                 (IVar6 = NSMutableArray::containsObject_(self,"containsObject:",IVar10),
                 (IVar6 & 0xff) == 0)) {
                NSMutableArray::addObject_(self,"addObject:",IVar10);
              }
              uVar7 = NSMutableArray::containsObject_(self,"containsObject:",IVar9);
              IVar10 = IVar9;
              goto joined_r0x0009b940;
            }
            IVar9 = NSMutableArray::containsObject_(self,"containsObject:",IVar10);
            if ((IVar9 & 0xff) != 0) goto LAB_0009b892;
LAB_0009b88e:
            NSMutableArray::addObject_(self,"addObject:",IVar10);
          }
        }
LAB_0009b892:
        local_94 = iVar5 + local_94;
        local_8c = local_8c + 1;
      } while (local_8c != local_9c);
      IVar10 = _objc_msgSend(IVar2,"countByEnumeratingWithState:objects:count:",&local_74,auStack_54
                             ,0x10);
      local_a0 = local_a0 + local_9c;
      local_9c = IVar10;
    } while (IVar10 != 0);
  }
  return self;
}

