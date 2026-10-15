
/* Function Stack Size: 0x8 bytes */

void __ABSwipeColumnScrollView_animate_(ID param_1,SEL param_2)

{
  bool bVar1;
  undefined4 uVar2;
  uint uVar3;
  int iVar4;
  int iVar5;
  undefined4 local_24;
  undefined4 local_20;
  undefined4 local_1c;
  undefined4 local_18;
  
  *(int *)(ABSwipeColumnScrollView::steps + param_1) =
       *(int *)(ABSwipeColumnScrollView::steps + param_1) + 1;
  iVar4 = ABSwipeColumnScrollView::workingBounds;
  uVar2 = ___addsf3vfp(*(undefined4 *)(ABSwipeColumnScrollView::workingBounds + param_1),
                       *(undefined4 *)(ABSwipeColumnScrollView::dx + param_1));
  *(undefined4 *)(iVar4 + param_1) = uVar2;
  iVar4 = ABSwipeColumnScrollView::dx;
  uVar2 = ___mulsf3vfp(*(undefined4 *)(ABSwipeColumnScrollView::dx + param_1),
                       *(undefined4 *)(ABSwipeColumnScrollView::friction + param_1));
  *(undefined4 *)(iVar4 + param_1) = uVar2;
  uVar3 = ___subsf3vfp(*(undefined4 *)(ABSwipeColumnScrollView::destinationOffset + param_1),
                       *(undefined4 *)(ABSwipeColumnScrollView::workingBounds + param_1));
  if ((*(byte *)(ABSwipeColumnScrollView::_swipeFlags + param_1) & 1) == 0) {
    uVar2 = ___mulsf3vfp(uVar3,*(undefined4 *)(ABSwipeColumnScrollView::springiness + param_1));
    iVar4 = ABSwipeColumnScrollView::dx;
    uVar2 = ___addsf3vfp(*(undefined4 *)(ABSwipeColumnScrollView::dx + param_1),uVar2);
    *(undefined4 *)(iVar4 + param_1) = uVar2;
  }
  CATransaction::begin((ID)&_OBJC_CLASS___CATransaction,"begin");
  CATransaction::setDisableActions_((ID)&_OBJC_CLASS___CATransaction,"setDisableActions:",1);
  _objc_msgSend_stret((undefined *)&local_24,param_1,"bounds");
  local_24 = _roundf(*(undefined4 *)(ABSwipeColumnScrollView::workingBounds + param_1));
  if (*(int *)(ABSwipeColumnScrollView::steps + param_1) < 200) {
    iVar4 = ___ltsf2vfp(*(uint *)(ABSwipeColumnScrollView::dx + param_1) & 0x7fffffff,0x3f800000);
    if (iVar4 != 0) {
      iVar4 = ___gesf2vfp(uVar3 & 0x7fffffff,0x3f800000);
      iVar5 = ___unordsf2vfp(uVar3 & 0x7fffffff,0x3f800000);
      if (iVar5 == 0 && iVar4 == 0) goto LAB_0009c99e;
    }
    bVar1 = false;
  }
  else {
LAB_0009c99e:
    local_24 = *(undefined4 *)(ABSwipeColumnScrollView::destinationOffset + param_1);
    _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::timer + param_1),"invalidate");
    *(undefined4 *)(ABSwipeColumnScrollView::timer + param_1) = 0;
    *(byte *)(ABSwipeColumnScrollView::_swipeFlags + param_1) =
         *(byte *)(ABSwipeColumnScrollView::_swipeFlags + param_1) & 0xfe;
    bVar1 = true;
  }
  _objc_msgSend(param_1,"setBounds:",local_24,local_20,local_1c,local_18);
  _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::delegate + param_1),"scrollViewDidScroll:",param_1)
  ;
  if (bVar1) {
    _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::delegate + param_1),
                  "scrollViewDidEndScrollingAnimation:",param_1);
  }
  CATransaction::commit((ID)&_OBJC_CLASS___CATransaction,"commit");
  return;
}

