
/* Function Stack Size: 0xc bytes */

float __TwitterPadTweetViewController_ab_swipeColumnWidth__(ID param_1,SEL param_2,int param_3)

{
  ID IVar1;
  float fVar2;
  
  IVar1 = _objc_msgSend(param_1,"needsWide");
  if ((IVar1 & 0xff) != 0) {
    fVar2 = 574.0;
    if (1 < param_3 - 1) {
      fVar2 = 830.0;
    }
    return fVar2;
  }
  fVar2 = (float)___floatsisfvfp(*(undefined4 *)PTR__ABSwipeColumnDefaultWidth_0016438c);
  return fVar2;
}

