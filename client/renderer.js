// 获取所有导航项和内容区域 (Get nav items and content sections)
const navLinks = document.querySelectorAll('.nav-links li');
const tabContents = document.querySelectorAll('.tab-content');

// 为每个导航项添加点击事件 (Add click event listener)
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        // 1. 移除所有 active 类 (Remove active class from all)
        navLinks.forEach(nav => nav.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active-content'));

        // 2. 为当前点击项添加 active (Add active to clicked)
        link.classList.add('active');

        // 3. 显示对应的内容 (Show corresponding content)
        const tabId = link.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active-content');
    });
});