
/* Function Stack Size: 0x8 bytes */

void __ABSwipeColumnScrollView_animate_(ID param_1,SEL param_2)

{
  int iVar1;
  undefined4 uVar2;
  
  *(int *)(ABSwipeColumnScrollView::steps + param_1) =
       *(int *)(ABSwipeColumnScrollView::steps + param_1) + 1;
  iVar1 = ABSwipeColumnScrollView::workingBounds;
  uVar2 = ___addsf3vfp(*(undefined4 *)(ABSwipeColumnScrollView::workingBounds + param_1),
                       *(undefined4 *)(ABSwipeColumnScrollView::dx + param_1));
  *(undefined4 *)(iVar1 + param_1) = uVar2;
  iVar1 = ABSwipeColumnScrollView::dx;
  uVar2 = ___mulsf3vfp(*(undefined4 *)(ABSwipeColumnScrollView::dx + param_1),
                       *(undefined4 *)(ABSwipeColumnScrollView::friction + param_1));
  *(undefined4 *)(iVar1 + param_1) = uVar2;
  uVar2 = ___subsf3vfp(*(undefined4 *)(ABSwipeColumnScrollView::destinationOffset + param_1),
                       *(undefined4 *)(ABSwipeColumnScrollView::workingBounds + param_1));
  if ((*(byte *)(ABSwipeColumnScrollView::_swipeFlags + param_1) & 1) == 0) {
    uVar2 = ___mulsf3vfp(uVar2,*(undefined4 *)(ABSwipeColumnScrollView::springiness + param_1));
    iVar1 = ABSwipeColumnScrollView::dx;
    uVar2 = ___addsf3vfp(*(undefined4 *)(ABSwipeColumnScrollView::dx + param_1),uVar2);
    *(undefined4 *)(iVar1 + param_1) = uVar2;
  }
  CATransaction::begin((ID)&_OBJC_CLASS___CATransaction,"begin");
  return;
}

