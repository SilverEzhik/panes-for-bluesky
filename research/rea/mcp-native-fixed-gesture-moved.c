
/* Function Stack Size: 0x10 bytes */

void __ABScrollGestureRecognizer_touchesMoved_withEvent__
               (ID param_1,SEL param_2,ID param_3,ID param_4)

{
  ID IVar1;
  ID IVar2;
  uint uVar3;
  int iVar4;
  int iVar5;
  uint uVar6;
  int iVar7;
  undefined4 uVar8;
  undefined4 uVar9;
  undefined4 uVar10;
  undefined4 uVar11;
  undefined4 *puVar12;
  ID self;
  undefined8 uVar13;
  undefined4 local_24;
  undefined4 local_20;
  objc_super local_1c;
  
  local_1c.super_class = &objc::class_t::ABScrollGestureRecognizer;
  local_1c.receiver = param_1;
  _objc_msgSendSuper2(&local_1c,"touchesMoved:withEvent:");
  if (*(int *)(ABScrollGestureRecognizer::_touch + param_1) == 0) {
    return;
  }
  IVar1 = _objc_msgSend(param_3,"containsObject:");
  if ((IVar1 & 0xff) == 0) {
    return;
  }
  IVar1 = _objc_msgSend(param_1,"view");
  self = *(ID *)(ABScrollGestureRecognizer::_touch + param_1);
  IVar2 = _objc_msgSend(IVar1,"superview");
  _objc_msgSend_stret((undefined *)&local_24,self,"locationInView:",IVar2);
  IVar2 = _objc_msgSend(param_1,"state");
  iVar4 = ABScrollGestureRecognizer::_dx;
  iVar7 = ABScrollGestureRecognizer::_firstPoint;
  switch(IVar2) {
  case 0:
    puVar12 = (undefined4 *)(ABScrollGestureRecognizer::_firstPoint + param_1);
    uVar3 = ___subsf3vfp(puVar12[1],local_20);
    uVar3 = uVar3 & 0x7fffffff;
    iVar4 = ___lesf2vfp(uVar3,0x41200000);
    iVar5 = ___unordsf2vfp(uVar3,0x41200000);
    uVar6 = ___subsf3vfp(*(undefined4 *)(iVar7 + param_1),local_24);
    uVar6 = uVar6 & 0x7fffffff;
    if (iVar5 == 0 && iVar4 == 0) {
      iVar7 = ___lesf2vfp(uVar3,uVar6);
      iVar4 = ___unordsf2vfp(uVar3,uVar6);
      if (iVar4 == 0 && iVar7 == 0) {
        uVar8 = 5;
        goto LAB_0009d1f8;
      }
    }
    iVar7 = ___lesf2vfp(uVar6,0x41200000);
    iVar4 = ___unordsf2vfp(uVar6,0x41200000);
    if (iVar4 == 0 && iVar7 == 0) {
      puVar12[1] = local_20;
      *puVar12 = local_24;
      iVar7 = ABScrollGestureRecognizer::_lastTime;
      uVar13 = _CFAbsoluteTimeGetCurrent();
      *(int *)(iVar7 + param_1) = (int)uVar13;
      *(int *)(iVar7 + param_1 + 4) = (int)((ulonglong)uVar13 >> 0x20);
      *(undefined4 *)(ABScrollGestureRecognizer::_dx + param_1) = 0;
      *(undefined4 *)(ABScrollGestureRecognizer::_dt + param_1) = 0x3c888889;
      _objc_msgSend(param_1,"setState:",1);
    }
    break;
  case 1:
    uVar8 = 2;
LAB_0009d1f8:
    _objc_msgSend(param_1,"setState:",uVar8);
    break;
  case 2:
    uVar8 = ___mulsf3vfp(*(undefined4 *)(ABScrollGestureRecognizer::_dx + param_1),0x3f666666);
    uVar9 = ___subsf3vfp(*(undefined4 *)(ABScrollGestureRecognizer::_lastPoint + param_1),local_24);
    uVar10 = ___mulsf3vfp(uVar9,0x3dccccd0);
    uVar8 = ___addsf3vfp(uVar8,uVar10);
    *(undefined4 *)(iVar4 + param_1) = uVar8;
    *(undefined4 *)(ABScrollGestureRecognizer::_dx + param_1) = uVar9;
    uVar13 = _CFAbsoluteTimeGetCurrent();
    iVar7 = ABScrollGestureRecognizer::_dt;
    uVar11 = (undefined4)((ulonglong)uVar13 >> 0x20);
    uVar8 = ___mulsf3vfp(*(undefined4 *)(ABScrollGestureRecognizer::_dt + param_1),0x3f000000);
    ___subdf3vfp((int)uVar13,uVar11,*(undefined4 *)(ABScrollGestureRecognizer::_lastTime + param_1),
                 *(undefined4 *)(ABScrollGestureRecognizer::_lastTime + param_1 + 4));
    uVar9 = ___truncdfsf2vfp();
    uVar10 = ___mulsf3vfp(uVar9,0x3f000000);
    uVar8 = ___addsf3vfp(uVar8,uVar10);
    *(undefined4 *)(iVar7 + param_1) = uVar8;
    *(undefined4 *)(ABScrollGestureRecognizer::_dt + param_1) = uVar9;
    iVar7 = ABScrollGestureRecognizer::_lastTime;
    *(int *)(ABScrollGestureRecognizer::_lastTime + param_1) = (int)uVar13;
    *(undefined4 *)(iVar7 + param_1 + 4) = uVar11;
    _objc_msgSend(IVar1,"_didScroll:",local_24,local_20);
    break;
  case 5:
    goto switchD_0009d176_caseD_5;
  }
  iVar7 = ABScrollGestureRecognizer::_lastPoint;
  *(undefined4 *)(ABScrollGestureRecognizer::_lastPoint + param_1) = local_24;
  *(undefined4 *)(iVar7 + param_1 + 4) = local_20;
switchD_0009d176_caseD_5:
  return;
}

