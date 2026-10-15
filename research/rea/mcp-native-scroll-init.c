
/* Function Stack Size: 0x18 bytes */

ID __ABSwipeColumnScrollView_initWithFrame__(ID param_1,SEL param_2,CGRect param_3)

{
  ID self;
  undefined4 in_r2;
  undefined4 in_r3;
  objc_super local_1c;
  
  local_1c.super_class = &objc::class_t::ABSwipeColumnScrollView;
  local_1c.receiver = param_1;
  self = _objc_msgSendSuper2(&local_1c,"initWithFrame:",in_r2,in_r3,param_3.field0_0x0.field0_0x0,
                             param_3.field0_0x0.field1_0x4);
  if (self != 0) {
                    /* WARNING: Subroutine does not return */
    _objc_msgSend(self,"setClipsToBounds:",0);
  }
  return 0;
}

