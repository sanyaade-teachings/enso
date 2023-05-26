use crate::Deref;
use crate::DerefMut;
use crate::Zeroable;
use core::fmt::Debug;
use std::cell::RefCell;


// ==================
// === RefCellOps ===
// ==================

pub trait RefCellOps {
    type Borrowed;
    /// Perform the provided lambda with the borrowed value of this `RefCell`.
    fn with_borrowed<T>(&self, f: impl FnOnce(&Self::Borrowed) -> T) -> T;
    /// Perform the provided lambda with the mutably borrowed value of this `RefCell`.
    fn with_borrowed_mut<T>(&self, f: impl FnOnce(&mut Self::Borrowed) -> T) -> T;
}

impl<T> RefCellOps for RefCell<T> {
    type Borrowed = T;
    #[inline(always)]
    fn with_borrowed<U>(&self, f: impl FnOnce(&Self::Borrowed) -> U) -> U {
        f(&*self.borrow())
    }
    #[inline(always)]
    fn with_borrowed_mut<U>(&self, f: impl FnOnce(&mut Self::Borrowed) -> U) -> U {
        f(&mut *self.borrow_mut())
    }
}

auto trait NotRefCell {}
impl<T> !NotRefCell for RefCell<T> {}

impl<T> RefCellOps for T
where
    T: NotRefCell + Deref,
    <T as Deref>::Target: RefCellOps,
{
    type Borrowed = <<T as Deref>::Target as RefCellOps>::Borrowed;
    #[inline(always)]
    fn with_borrowed<U>(&self, f: impl FnOnce(&Self::Borrowed) -> U) -> U {
        self.deref().with_borrowed(f)
    }
    #[inline(always)]
    fn with_borrowed_mut<U>(&self, f: impl FnOnce(&mut Self::Borrowed) -> U) -> U {
        self.deref().with_borrowed_mut(f)
    }
}



// ==================
// === OptRefCell ===
// ==================

#[cfg(debug_assertions)]
use crate::ZeroableRefCell;
#[cfg(not(debug_assertions))]
use std::cell::UnsafeCell;

/// Just like [`RefCell`], but compiled as [`UnsafeCell`] in release mode, which makes it zero-cost.
///
/// Please use this type in performance-critical code sections only. The runtime overhead of
/// [`RefCell`] is small and in most cases negligible. Multiple mutable borrows of [`UnsafeCell`]
/// cause immediate undefined behavior, so all code using it must be extensively tested.
#[derive(Default, Zeroable)]
#[repr(transparent)]
pub struct OptRefCell<T> {
    #[cfg(not(debug_assertions))]
    inner: UnsafeCell<T>,
    #[cfg(debug_assertions)]
    inner: ZeroableRefCell<T>,
}

#[cfg(not(debug_assertions))]
#[allow(missing_docs)] // The functions reflect the [`RefCell`] API.
impl<T> OptRefCell<T> {
    #[inline(always)]
    pub fn borrow(&self) -> &T {
        unsafe { &*self.inner.get() }
    }

    #[inline(always)]
    pub fn borrow_mut(&self) -> &mut T {
        unsafe { &mut *self.inner.get() }
    }

    #[inline(always)]
    pub fn with_borrowed<R>(&self, f: impl FnOnce(&T) -> R) -> R {
        f(self.borrow())
    }

    #[inline(always)]
    pub fn with_borrowed_mut<R>(&self, f: impl FnOnce(&mut T) -> R) -> R {
        f(self.borrow_mut())
    }
}

#[cfg(debug_assertions)]
impl<T> Deref for OptRefCell<T> {
    type Target = ZeroableRefCell<T>;
    #[inline(always)]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

#[cfg(debug_assertions)]
impl<T> DerefMut for OptRefCell<T> {
    #[inline(always)]
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.inner
    }
}

impl<T: Debug> Debug for OptRefCell<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        Debug::fmt(&self.borrow(), f)
    }
}