
/* Function Stack Size: 0x8 bytes */

void __ABSwipeColumnScrollView__animateToDestinationOffset_(ID param_1,SEL param_2)

{
  int iVar1;
  ID IVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  undefined4 local_24 [4];
  
  iVar1 = ABSwipeColumnScrollView::destinationOffset;
  IVar2 = _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::delegate + param_1),
                        "swipeView:willSwipeToOffset:throwing:",param_1,
                        *(undefined4 *)(ABSwipeColumnScrollView::destinationOffset + param_1),
                        *(byte *)(ABSwipeColumnScrollView::_swipeFlags + param_1) >> 1 & 1);
  *(ID *)(iVar1 + param_1) = IVar2;
  if ((*(byte *)(ABSwipeColumnScrollView::_swipeFlags + param_1) & 1) == 0) {
    *(undefined4 *)(ABSwipeColumnScrollView::friction + param_1) = 0x3f333333;
    *(undefined4 *)(ABSwipeColumnScrollView::springiness + param_1) = 0x3d4ccccd;
  }
  else {
    *(undefined4 *)(ABSwipeColumnScrollView::friction + param_1) = 0x3f4ccccd;
    *(undefined4 *)(ABSwipeColumnScrollView::springiness + param_1) = 0x3d75c28f;
    uVar3 = ___subsf3vfp(0x3f800000,*(undefined4 *)(ABSwipeColumnScrollView::friction + param_1));
    iVar1 = ABSwipeColumnScrollView::dx;
    uVar4 = *(undefined4 *)(ABSwipeColumnScrollView::destinationOffset + param_1);
    _objc_msgSend_stret((undefined *)local_24,param_1,"bounds");
    uVar4 = ___subsf3vfp(uVar4,local_24[0]);
    uVar3 = ___mulsf3vfp(uVar3,uVar4);
    *(undefined4 *)(iVar1 + param_1) = uVar3;
  }
  if (*(ID *)(ABSwipeColumnScrollView::timer + param_1) != 0) {
    _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::timer + param_1),"invalidate");
    *(undefined4 *)(ABSwipeColumnScrollView::timer + param_1) = 0;
  }
  *(undefined4 *)(ABSwipeColumnScrollView::steps + param_1) = 0;
  iVar1 = ABSwipeColumnScrollView::timer;
  IVar2 = NSTimer::timerWithTimeInterval_target_selector_userInfo_repeats_
                    ((ID)&_OBJC_CLASS___NSTimer,
                     "timerWithTimeInterval:target:selector:userInfo:repeats:",0x11111111,0x3f911111
                     ,param_1,"animate",0,1);
  *(ID *)(iVar1 + param_1) = IVar2;
  IVar2 = NSRunLoop::mainRunLoop((ID)&_OBJC_CLASS___NSRunLoop,"mainRunLoop");
  NSRunLoop::addTimer_forMode_
            (IVar2,"addTimer:forMode:",*(undefined4 *)(ABSwipeColumnScrollView::timer + param_1),
             *(undefined4 *)PTR__NSRunLoopCommonModes_001643dc);
  return;
}

