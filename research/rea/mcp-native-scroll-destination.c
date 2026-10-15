
/* Function Stack Size: 0x8 bytes */

void __ABSwipeColumnScrollView__animateToDestinationOffset_(ID param_1,SEL param_2)

{
                    /* WARNING: Subroutine does not return */
  _objc_msgSend(*(ID *)(ABSwipeColumnScrollView::delegate + param_1),
                "swipeView:willSwipeToOffset:throwing:",param_1,
                *(undefined4 *)(ABSwipeColumnScrollView::destinationOffset + param_1),
                *(byte *)(ABSwipeColumnScrollView::_swipeFlags + param_1) >> 1 & 1);
}

