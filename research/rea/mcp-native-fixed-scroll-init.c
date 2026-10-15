
/* Function Stack Size: 0x18 bytes */

ID __ABSwipeColumnScrollView_initWithFrame__(ID param_1,SEL param_2,CGRect param_3)

{
  int iVar1;
  ID self;
  ID IVar2;
  undefined4 in_r2;
  undefined4 in_r3;
  objc_super local_1c;
  
  local_1c.super_class = &objc::class_t::ABSwipeColumnScrollView;
  local_1c.receiver = param_1;
  self = _objc_msgSendSuper2(&local_1c,"initWithFrame:",in_r2,in_r3,param_3.field0_0x0.field0_0x0,
                             param_3.field0_0x0.field1_0x4);
  if (self != 0) {
    _objc_msgSend(self,"setClipsToBounds:",0);
    iVar1 = ABSwipeColumnScrollView::r;
    IVar2 = _objc_msgSend((ID)&objc::class_t::ABScrollGestureRecognizer,"alloc");
    IVar2 = _objc_msgSend(IVar2,"initWithTarget:action:",0,0);
    *(ID *)(iVar1 + self) = IVar2;
    _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::r + self),"setDelaysTouchesBegan:",0);
    _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::r + self),"setDelaysTouchesEnded:",0);
    _objc_msgSend(self,"addGestureRecognizer:",*(undefined4 *)(ABSwipeColumnScrollView::r + self));
    _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::r + self),"release");
  }
  return self;
}

