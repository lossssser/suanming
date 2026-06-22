const TOPICS = {
  "ros-common": {
    eyebrow: "C++ Engineering · ROS",
    title: "智能驾驶 ROS 常用语法",
    lead: "ROS 是很多智驾工具链、仿真、回放和算法验证的通用语言。你不一定要做 ROS 开发专家，但要能读懂节点、话题、消息和数据流。",
    chapters: [
      {
        title: "为什么要学 ROS",
        body: [
          "智能驾驶里大量工具围绕“数据流”工作：感知结果、定位、规划轨迹、车辆状态、HMI 状态都会被发布、订阅、录制和回放。ROS 的价值在于它把这些数据流组织成节点和话题，让你能快速定位模块之间的输入输出关系。",
          "对你来说，ROS 不是为了转机器人方向，而是为了提高智驾测试开发、仿真评测和问题复现能力。会 ROS，意味着你能看懂 rosbag、能查 topic、能把一个问题从 HMI 表现追到后端数据。"
        ],
        points: ["节点 node 是计算单元", "话题 topic 是异步数据流", "服务 service 是请求响应", "消息 msg 是接口协议", "launch 用来组织启动流程"],
        practice: "找一个 rosbag 或示例工程，列出所有 topic，画出“输入 topic -> 处理节点 -> 输出 topic”的链路图。"
      },
      {
        title: "节点、话题、消息",
        body: [
          "节点可以理解成一个独立模块。比如 perception_node 发布障碍物，planning_node 订阅障碍物并发布轨迹，hmi_node 订阅状态并展示到界面。",
          "消息定义决定模块之间能交换什么数据。测试开发要尤其关注消息字段是否稳定、时间戳是否正确、坐标系是否一致。很多问题不是算法错，而是字段含义、单位、时间同步出了问题。"
        ],
        code: "rosnode list\nrostopic list\nrostopic echo /planning/trajectory\nrostopic hz /perception/objects",
        practice: "选择一个 topic，记录它的频率、关键字段、字段单位和上下游模块。"
      },
      {
        title: "调试数据流",
        body: [
          "测试或定位问题时，不要只看最终 UI。要从数据流的上游往下游查：输入是否存在、频率是否正常、时间戳是否跳变、字段是否为空、下游是否订阅了正确 topic。",
          "这套思路可以迁移到 ROS2、DDS、SOME/IP、内部通信框架。你真正要练的是“通信链路排查能力”。"
        ],
        points: ["先查 topic 是否存在", "再查频率是否稳定", "再查字段是否符合预期", "最后查下游消费逻辑"],
        interview: "可以这样表达：我熟悉基于 topic 的智驾数据流排查，能通过 topic 列表、频率、消息字段和回放定位模块输入输出问题。"
      }
    ]
  },
  "cpp-thread-memory-performance": {
    eyebrow: "C++ Engineering · Runtime",
    title: "多线程、内存、性能分析",
    lead: "车端 C++ 模块稳定性离不开并发、内存和性能。你不需要一开始写极致优化代码，但必须能定位卡顿、崩溃、死锁和资源泄漏。",
    chapters: [
      {
        title: "为什么这是 C++ 工程核心",
        body: [
          "智能驾驶模块通常是实时系统：多个线程接收数据、处理算法、发布结果、记录日志。任何一个锁使用不当、内存生命周期不清、性能瓶颈没定位，都会导致延迟、掉帧、崩溃或偶现问题。",
          "你的覆盖率和 HMI server 经历可以和这块连起来：覆盖率保证代码走到，性能分析保证代码跑得稳，多线程能力保证模块能处理真实车端并发场景。"
        ],
        points: ["线程安全", "锁粒度", "对象生命周期", "内存泄漏", "CPU 占用", "延迟统计"]
      },
      {
        title: "多线程基本模型",
        body: [
          "先理解三种常见模型：生产者消费者、定时任务、线程池。智驾里接收消息的一端像生产者，处理和发布的一端像消费者。队列长度、锁粒度、超时策略都会影响稳定性。",
          "不要迷信多线程越多越快。线程越多，调度和同步成本越高。工程上更重要的是数据边界清晰、共享状态少、锁持有时间短。"
        ],
        code: "std::mutex mutex_;\nstd::condition_variable cv_;\nstd::queue<Frame> queue_;\n\n// 重点不是背 API，而是知道谁持有数据，谁唤醒谁。",
        practice: "写一个生产者消费者队列：一个线程写入 Frame，一个线程消费 Frame，并统计平均延迟。"
      },
      {
        title: "内存与性能定位",
        body: [
          "崩溃常见原因包括悬空指针、越界访问、重复释放、对象生命周期短于引用者。性能问题常见原因包括无意义拷贝、日志过多、锁竞争、循环内频繁分配内存。",
          "定位时要形成流程：先复现，再拿 core 或日志，再看栈，再缩小模块，再加指标。不要凭感觉改代码。"
        ],
        points: ["gdb 看崩溃栈", "valgrind/asan 看内存错误", "perf 看热点", "日志加耗时点", "统计 P50/P90/P99 延迟"],
        interview: "可以这样表达：我能从 crash 栈、日志、耗时指标和性能采样入手定位 C++ 模块稳定性问题。"
      }
    ]
  },
  cmake: {
    eyebrow: "C++ Engineering · Build",
    title: "CMake 语法、使用",
    lead: "CMake 是 C++ 工程的骨架。会写业务代码但不会组织构建，面试平台开发和中间件开发会吃亏。",
    chapters: [
      {
        title: "CMake 解决什么问题",
        body: [
          "CMake 不是编译器，它负责描述工程怎么构建：哪些源文件生成库，哪些库链接到可执行文件，头文件在哪里，编译选项是什么。",
          "在智驾项目里，一个模块往往依赖通信库、protobuf、日志库、测试库。CMake 写得清楚，模块才容易被测试、集成和部署。"
        ],
        points: ["target 是核心", "少用全局 include", "依赖要绑定到 target", "测试也应该是 target"]
      },
      {
        title: "target 思维",
        body: [
          "现代 CMake 推荐围绕 target 写。不要到处写 include_directories 和 link_directories，而是把依赖关系挂到具体库或可执行文件上。",
          "这样做的好处是依赖边界清晰，别人链接你的库时，必要的头文件和依赖能自动传递。"
        ],
        code: "add_library(hmi_server src/hmi_server.cpp)\ntarget_include_directories(hmi_server PUBLIC include)\ntarget_link_libraries(hmi_server PUBLIC protobuf::libprotobuf)\n\nadd_executable(hmi_server_main src/main.cpp)\ntarget_link_libraries(hmi_server_main PRIVATE hmi_server)",
        practice: "把一个小 C++ 类拆成 library + executable + test 三个 target。"
      },
      {
        title: "测试和覆盖率里的 CMake",
        body: [
          "你做覆盖率时会遇到编译选项。gcov/lcov 通常需要打开 `--coverage`，llvm-cov 需要 clang 的 profile 选项。CMake 要能按 Debug/Coverage 配置切换。",
          "工程化岗位很看重你能不能把构建、测试、覆盖率串成流水线。"
        ],
        interview: "可以这样表达：我熟悉 CMake target 组织方式，能把模块、单测和覆盖率编译选项接入到工程构建中。"
      }
    ]
  },
  gtest: {
    eyebrow: "C++ Engineering · Unit Test",
    title: "gtest 语法、使用",
    lead: "gtest 是 C++ 模块质量的基本功。你做覆盖率测试，如果能把 gtest 和覆盖率结合起来，会比只会跑报告更值钱。",
    chapters: [
      {
        title: "单测到底测什么",
        body: [
          "单测不是把函数调用一遍，而是验证输入、输出、边界和异常路径。智驾模块里，单测适合覆盖状态机、数据转换、配置解析、阈值判断、HMI 状态聚合等逻辑。",
          "不要一开始就测复杂算法全链路。先从纯逻辑、无外部依赖、可重复的函数开始。"
        ],
        points: ["正常路径", "边界路径", "异常输入", "状态切换", "回归 bug 固化"]
      },
      {
        title: "fixture 与参数化",
        body: [
          "fixture 用于复用测试准备工作，比如初始化配置、构造假数据。参数化测试用于同一逻辑跑多组输入，适合阈值、枚举状态、错误码映射。",
          "好的测试应该让读代码的人一眼知道这个模块承诺了什么行为。"
        ],
        code: "TEST(HmiStateTest, ShouldReportErrorWhenModuleTimeout) {\n  HmiState state;\n  state.UpdateModuleHeartbeat(\"planning\", 1200);\n  EXPECT_EQ(state.GetModuleStatus(\"planning\"), ModuleStatus::Timeout);\n}",
        practice: "给一个状态机写 5 个单测：初始态、正常切换、异常输入、超时、恢复。"
      },
      {
        title: "和覆盖率结合",
        body: [
          "覆盖率不是目标本身，它是帮你发现没测到的代码。更重要的是看未覆盖代码是否是关键逻辑、异常分支还是无效代码。",
          "面试时不要只说覆盖率百分比，要说你如何用覆盖率驱动补测和质量闭环。"
        ],
        interview: "可以这样表达：我能用 gtest 固化模块行为，并结合覆盖率报告识别未覆盖分支，推动补测和代码质量改进。"
      }
    ]
  },
  "linux-gdb": {
    eyebrow: "C++ Engineering · Debug",
    title: "Linux 调试：gdb",
    lead: "gdb 是 C++ 崩溃定位的底层工具。你不一定每天用，但必须能看懂 core、栈和线程。",
    chapters: [
      {
        title: "gdb 的定位价值",
        body: [
          "C++ 线上或车端问题常常不是 IDE 里点一下就能看到的。你拿到的可能只有日志、二进制、core 文件。gdb 能告诉你程序崩在哪里、调用栈是什么、变量当时是什么值。",
          "调试能力强的人，能把“偶现崩溃”变成“某对象生命周期错误导致的空指针访问”。这就是工程价值。"
        ],
        points: ["bt 看调用栈", "frame 切栈帧", "p 看变量", "info threads 看线程", "thread apply all bt 看所有线程栈"]
      },
      {
        title: "常用命令",
        body: ["先把常用命令练熟，再去看高级技巧。实际定位时，80% 情况靠栈、变量、线程和断点就能推进。"],
        code: "gdb ./module core\nbt\nframe 2\np variable\ninfo threads\nthread apply all bt\nbreak File.cpp:123\nrun",
        practice: "写一个空指针崩溃小程序，生成 core，用 gdb 找到崩溃行和调用栈。"
      },
      {
        title: "面试怎么讲",
        body: [
          "不要说“我会 gdb 命令”。要讲定位流程：如何复现，如何拿 core，如何看栈，如何判断是不是空指针、越界、并发问题，如何修复和补测试。",
          "这能把你从普通测试执行者，提升成能闭环问题的工程师。"
        ],
        interview: "可以这样表达：我能使用 gdb/core dump 分析 C++ 崩溃问题，通过调用栈和线程栈定位异常路径，并补充回归测试。"
      }
    ]
  },
  coverage: {
    eyebrow: "C++ Engineering · Coverage",
    title: "代码覆盖率：gcov / lcov / llvm-cov",
    lead: "覆盖率方向和你当前经历高度相关。把它做深，可以转成质量平台、测试开发和工程效能的亮点。",
    chapters: [
      {
        title: "覆盖率的意义",
        body: [
          "覆盖率告诉你测试执行到了哪些代码，但不直接等于质量。真正有价值的是：用覆盖率找到关键未测逻辑，推动补测；用增量覆盖率守住新代码质量；用报告帮助团队看到风险。",
          "你要从“跑工具的人”升级成“设计覆盖率质量闭环的人”。"
        ],
        points: ["行覆盖", "函数覆盖", "分支覆盖", "增量覆盖", "覆盖率门禁"]
      },
      {
        title: "工具链理解",
        body: [
          "gcov/lcov 常见于 GCC 工具链，llvm-cov 常见于 Clang 工具链。核心流程都是编译时插桩、运行测试、收集数据、生成报告。",
          "工程里难点通常不是命令，而是如何接入复杂构建、过滤无关目录、合并多次测试结果、让报告能被 CI 使用。"
        ],
        code: "lcov --capture --directory build --output-file coverage.info\ngenhtml coverage.info --output-directory coverage_html\n\nllvm-profdata merge -sparse default.profraw -o coverage.profdata\nllvm-cov show ./app -instr-profile=coverage.profdata",
        practice: "给一个小 C++ 工程接入覆盖率，生成 HTML 报告，并解释未覆盖分支。"
      },
      {
        title: "涨薪表达",
        body: [
          "覆盖率岗位要讲数据闭环：覆盖率如何采集，如何展示，如何设置门禁，如何定位未覆盖原因，如何推动开发补测。",
          "如果你能把覆盖率和 gtest、CI/CD、质量看板结合起来，就不是单点工具，而是工程效能平台。"
        ],
        interview: "可以这样表达：我负责 C++ 覆盖率测试与质量度量，能接入 gcov/lcov/llvm-cov，生成报告并推动未覆盖关键分支补测。"
      }
    ]
  }
};

TOPICS["ros-common"].chapters.push(
  {
    title: "从智驾视角理解 ROS 数据链路",
    body: [
      "学 ROS 时不要把它当成孤立工具，而要把它当成“模块之间传数据的地图”。一个智驾系统里，定位、感知、规划、控制、HMI、日志录制都可能通过 topic 串起来。你作为测试开发或平台工程师，真正要掌握的是：某个现象出现后，怎样沿着数据链路往上游查。",
      "比如 HMI 上显示规划模块异常，你不能只看界面。你应该先查 HMI 订阅的状态 topic 是否还在发布，再查规划模块自己的状态 topic，再查规划输入的定位、感知、地图数据是否正常。这样排查才有工程味。"
    ],
    points: [
      "先确认 topic 是否存在，不存在通常是节点未启动或命名空间错误",
      "再确认发布频率，频率低或抖动可能导致下游超时",
      "再看时间戳，时间戳跳变会影响融合、回放和同步",
      "最后看关键字段，空数组、默认值、坐标系错误都很常见"
    ],
    practice: "选 5 个典型 topic，整理成一张表：topic 名称、发布节点、订阅节点、频率、关键字段、异常时表现。"
  },
  {
    title: "launch、参数和命名空间",
    body: [
      "真实工程里很少手动一个个启动节点，通常通过 launch 文件组织。launch 的价值是把节点、参数、命名空间、重映射关系固定下来，保证测试环境可重复。你做自动化回归时，能否稳定启动一套环境非常关键。",
      "参数用于控制模块行为，例如超时阈值、topic 名称、是否开启 debug 输出。命名空间用于隔离多套系统或不同车辆实例。很多“明明代码没错”的问题，其实是参数文件加载错、topic remap 错、命名空间不一致。"
    ],
    points: [
      "launch 负责把多个节点和参数组织成一次可重复启动",
      "参数要记录默认值、单位、范围和影响",
      "命名空间变化后，topic 名也会变化",
      "自动化测试前要先校验参数和 topic 是否符合预期"
    ],
    code: "rosparam get /planning/timeout_ms\nroslaunch package_name demo.launch\nrostopic list | grep planning",
    practice: "设计一个启动前检查脚本：检查关键参数是否存在，关键 topic 是否出现，关键节点是否已启动。"
  },
  {
    title: "把 ROS 能力写进简历",
    body: [
      "简历里不要写“熟悉 ROS”。这句话太空。你要写你能做什么：能通过 topic 频率、消息字段、rosbag 回放定位模块输入输出异常；能为自动化回归准备 launch 启动和数据检查；能沉淀问题复现数据。",
      "如果你后续做仿真评测平台，ROS 能力会和 rosbag、场景回放、指标计算连起来。它不是你的终点，但它是你进入智驾测试开发和工具链开发的抓手。"
    ],
    interview: "我熟悉 ROS 数据流排查方法，能基于节点、topic、消息字段、频率和 rosbag 回放定位智驾模块输入输出问题，并将这些检查接入自动化回归流程。"
  }
);

TOPICS["cpp-thread-memory-performance"].chapters.push(
  {
    title: "生产者消费者：车端模块最常见的并发模型",
    body: [
      "很多车端模块都像一个生产者消费者系统：通信线程不断收到新帧，处理线程从队列里取帧，发布线程把结果发出去。这个模型不复杂，但工程细节很多：队列满了怎么办，处理太慢怎么办，是否丢旧帧，是否阻塞上游。",
      "测试时要关注三类指标：吞吐量、延迟、丢帧。比如输入 20Hz，处理平均 30ms 看似没问题，但 P99 延迟到 200ms 就可能让 HMI 状态抖动或规划链路超时。"
    ],
    points: [
      "队列长度不是越大越好，太大会隐藏延迟",
      "实时链路常常宁愿丢旧帧，也不要处理过期数据",
      "锁里不要做耗时操作，拿数据后尽快释放锁",
      "日志要节流，循环里高频打印会制造性能问题"
    ],
    code: "std::unique_lock<std::mutex> lock(mutex_);\ncv_.wait(lock, [&] { return !queue_.empty() || stopped_; });\nif (stopped_) return;\nFrame frame = std::move(queue_.front());\nqueue_.pop();\nlock.unlock();\nProcess(frame);",
    practice: "实现一个限长队列：超过最大长度时丢弃最旧帧，并统计 dropped_count、queue_size、max_latency_ms。"
  },
  {
    title: "内存问题的定位顺序",
    body: [
      "C++ 内存问题最麻烦的是偶现。你要形成固定流程：先确认是否能复现，再打开符号和 core，再看崩溃栈，再判断是空指针、越界、use-after-free 还是数据竞争。不要一上来靠猜。",
      "智能驾驶模块中常见的内存坑包括：异步回调持有了已经析构的对象；容器扩容后旧引用失效；跨线程读写没有保护；返回了局部变量引用；裸指针指向的对象所有权不清。"
    ],
    points: [
      "空指针：看调用栈里哪个对象为 null",
      "越界访问：重点检查数组下标和 vector size",
      "悬空引用：检查对象生命周期是否短于使用者",
      "数据竞争：检查共享变量是否在多个线程读写",
      "泄漏：检查 shared_ptr 循环引用和长期缓存"
    ],
    practice: "故意写 3 个小 bug：vector 越界、返回局部引用、跨线程无锁读写。分别说明它们可能造成什么现象。"
  },
  {
    title: "性能分析要看 P99，而不是只看平均值",
    body: [
      "智驾系统很重视尾延迟。平均耗时低不代表稳定，P90、P99、最大值更能反映偶发卡顿。比如 HMI server 平均处理 5ms，但偶尔 500ms，用户看到的就是状态卡顿或延迟。",
      "做性能分析时，先加粗粒度耗时点，定位是接收、解析、处理、发布哪一段慢；再用 perf、火焰图或采样工具看具体热点。不要先陷入微优化。"
    ],
    points: [
      "先分段统计耗时，再深入热点函数",
      "重点关注 P90/P99/最大值",
      "检查循环内内存分配、字符串拼接、高频日志",
      "检查锁等待时间和队列堆积",
      "优化前后要有同一批数据对比"
    ],
    interview: "我定位性能问题时会先建立耗时指标，关注平均值和 P99，再结合日志、perf 或火焰图定位热点，最后通过回归数据验证优化效果。"
  }
);

TOPICS.cmake.chapters.push(
  {
    title: "一个适合练习的 C++ 工程目录",
    body: [
      "CMake 学习不要停留在命令记忆，要落实到目录组织。一个小工程也应该拆出 include、src、tests。这样你后续做模块开发、单测、覆盖率时，结构自然就顺了。",
      "推荐你从一个很小的 `module_health_monitor` 项目开始。它不需要复杂业务，但能练到库、可执行文件、单测、覆盖率四件事。"
    ],
    code: "module_health_monitor/\n  CMakeLists.txt\n  include/module_health_monitor.h\n  src/module_health_monitor.cpp\n  src/main.cpp\n  tests/module_health_monitor_test.cpp",
    points: [
      "include 放对外头文件",
      "src 放实现和 main",
      "tests 放 gtest",
      "模块逻辑先做成 library，main 和 test 都链接这个 library"
    ],
    practice: "按这个目录创建一个工程，要求 main 可以运行，test 可以执行，模块逻辑不写在 main 里。"
  },
  {
    title: "PUBLIC、PRIVATE、INTERFACE 怎么理解",
    body: [
      "这是 CMake 面试和工程使用里的高频点。简单理解：PRIVATE 是只有自己需要，PUBLIC 是自己和使用者都需要，INTERFACE 是自己不编译但使用者需要。用错后，常见表现是本模块能编译，别人链接你就失败。",
      "比如一个库的头文件里暴露了 protobuf 生成的类型，那么 protobuf 依赖就可能需要 PUBLIC；如果只在 cpp 内部用日志库，日志库通常 PRIVATE 即可。"
    ],
    points: [
      "PRIVATE：实现细节，不传递给依赖方",
      "PUBLIC：自己需要，依赖方也需要",
      "INTERFACE：头文件库或只传递使用要求",
      "优先围绕 target 写依赖，避免全局 include 污染"
    ],
    code: "target_include_directories(module_health PUBLIC include)\ntarget_link_libraries(module_health PRIVATE spdlog::spdlog)\ntarget_link_libraries(module_health PUBLIC protobuf::libprotobuf)",
    practice: "解释你项目里每一个 target_link_libraries 为什么是 PUBLIC 或 PRIVATE。"
  },
  {
    title: "把 CMake 和覆盖率连起来",
    body: [
      "你现在做覆盖率测试，所以 CMake 必须学到能接覆盖率选项的程度。GCC 下常见做法是给 Debug/Coverage 构建加 `--coverage -O0 -g`，然后运行测试生成 `.gcda` 数据，再用 lcov 收集。",
      "真正工程里还要过滤第三方库、测试代码、生成代码，只看业务模块。否则报告看起来很热闹，但对质量改进帮助不大。"
    ],
    code: "option(ENABLE_COVERAGE \"Enable coverage\" OFF)\nif(ENABLE_COVERAGE AND CMAKE_CXX_COMPILER_ID MATCHES \"GNU\")\n  add_compile_options(--coverage -O0 -g)\n  add_link_options(--coverage)\nendif()",
    practice: "给你的练习工程加 `ENABLE_COVERAGE` 选项，并写 README 说明如何生成覆盖率报告。"
  }
);

TOPICS.gtest.chapters.push(
  {
    title: "先测状态机和数据转换",
    body: [
      "C++ 单测最好从纯逻辑开始。智能驾驶里最适合单测的不是大算法，而是状态机、错误码映射、配置解析、字段转换、阈值判断。它们依赖少、结果明确、改动频繁，一旦出错影响也很直接。",
      "比如 HMI server 里，把多个模块状态聚合成一个展示状态，这就非常适合 gtest。你可以构造不同输入：全部正常、规划超时、感知错误、定位无数据，然后验证输出。"
    ],
    points: [
      "输入明确，输出明确",
      "不要依赖真实网络和真实车端环境",
      "先测正常路径，再测边界和异常",
      "每个历史 bug 都应该固化成回归单测"
    ],
    practice: "为 `ModuleHealthMonitor` 设计 8 个测试用例：初始化、收到心跳、超时、恢复、未知模块、错误状态、多个模块、边界时间。"
  },
  {
    title: "测试名就是文档",
    body: [
      "好的测试名能直接表达业务承诺。比如 `ShouldReportTimeoutWhenHeartbeatIsExpired` 比 `TestStatus1` 好得多。别人读测试时，会理解这个模块遇到心跳过期时应该上报超时。",
      "断言也要具体。不要只断言返回 true，而要断言状态、错误码、关键字段。这样失败时才能快速知道哪里坏了。"
    ],
    code: "TEST(ModuleHealthMonitorTest, ShouldReportTimeoutWhenHeartbeatIsExpired) {\n  ModuleHealthMonitor monitor;\n  monitor.UpdateHeartbeat(\"planning\", 1000);\n\n  const auto status = monitor.GetStatus(\"planning\", 2501);\n\n  EXPECT_EQ(status.name, \"planning\");\n  EXPECT_EQ(status.state, ModuleState::Timeout);\n}",
    points: [
      "测试名描述场景和期望",
      "Arrange / Act / Assert 三段清楚",
      "断言关键字段，不要断言太粗",
      "失败信息要能帮助定位"
    ]
  },
  {
    title: "mock 和依赖隔离",
    body: [
      "当模块依赖时间、文件、网络、通信框架时，直接单测会很痛苦。解决方法是依赖抽象：把时间源、数据源、发布接口抽成接口或可替换对象，测试时传 fake 实现。",
      "不要过早追求复杂 mock 框架。先学会用简单 fake 类隔离外部依赖。比如把 `NowMs()` 变成 `Clock` 接口，测试里手动控制时间，就能稳定测试超时逻辑。"
    ],
    practice: "给 `ModuleHealthMonitor` 增加一个 FakeClock，让测试不依赖真实系统时间。"
  }
);

TOPICS["linux-gdb"].chapters.push(
  {
    title: "拿到 core 以后怎么做",
    body: [
      "很多人说会 gdb，但真拿到 core 文件就不知道下一步。固定流程是：确认二进制和 core 匹配，加载 gdb，先 `bt` 看当前线程栈，再 `thread apply all bt` 看所有线程，最后切到可疑栈帧查看变量。",
      "如果是多线程程序，当前崩溃线程不一定能解释全部问题。比如一个线程崩在访问队列，真正原因可能是另一个线程提前释放了对象。"
    ],
    code: "gdb ./hmi_server core.1234\nbt\ninfo threads\nthread apply all bt\nframe 3\np this\np module_name",
    points: [
      "先看崩溃信号，比如 SIGSEGV 通常是非法内存访问",
      "bt 看调用链，找到业务代码第一现场",
      "frame 切到业务栈帧，再看变量",
      "多线程问题一定看所有线程栈"
    ],
    practice: "写一个访问空指针的小程序，打开 core dump，生成 core 后用 gdb 找到崩溃行。"
  },
  {
    title: "断点不是只会 break",
    body: [
      "调试业务逻辑时，普通断点很有用，但条件断点更接近真实工程。比如只有 module_name 等于 planning 时停住，或者队列大小超过 100 时停住。这样可以避免你在高频循环里被断点淹没。",
      "观察点 watch 适合查某个变量什么时候被改坏。比如状态本来是 Running，某个路径突然改成 Error，可以 watch 这个字段。"
    ],
    code: "break module_health.cpp:42 if module_name == \"planning\"\nwatch status.state\ncontinue\nnext\nstep\nfinish",
    points: [
      "break：普通断点",
      "condition：给断点加条件",
      "watch：观察变量何时变化",
      "next：单步越过函数",
      "step：进入函数",
      "finish：跑完当前函数"
    ]
  },
  {
    title: "把 gdb 和测试闭环连起来",
    body: [
      "定位完崩溃不是结束。你要把复现路径写成单测或自动化用例，防止以后再坏。这个动作非常重要，因为它体现你不是只会救火，而是会建设质量体系。",
      "比如你发现空指针来自配置加载失败但后续没判断，那么修复后应该加测试：配置不存在时模块返回错误状态，而不是继续运行。"
    ],
    interview: "我处理 C++ 崩溃问题时，会用 core dump 和 gdb 定位调用栈及变量状态，修复后补充 gtest 或自动化回归用例，形成问题闭环。"
  }
);

TOPICS.coverage.chapters.push(
  {
    title: "覆盖率报告应该怎么看",
    body: [
      "覆盖率报告不是越高越好，而是要看关键逻辑有没有被覆盖。比如错误处理、超时分支、边界条件、状态恢复路径，往往比普通正常路径更重要。你要能拿着报告判断风险，而不是只报一个百分比。",
      "看报告时先分层：哪些文件是业务核心，哪些是工具代码，哪些是生成代码，哪些是测试代码。生成代码和第三方代码通常要过滤，否则会污染结论。"
    ],
    points: [
      "优先看核心业务文件",
      "重点看未覆盖分支，而不只是未覆盖行",
      "过滤第三方库、生成代码和测试代码",
      "把历史 bug 对应路径加入重点覆盖范围"
    ],
    practice: "拿一个覆盖率 HTML 报告，挑出 5 个你认为有风险的未覆盖位置，并说明为什么。"
  },
  {
    title: "增量覆盖率更适合团队落地",
    body: [
      "总覆盖率很容易被历史代码拖累，也容易让团队觉得目标遥远。增量覆盖率更适合作为门禁：新改动的代码至少要有足够测试。这样不会要求一次性改完历史债务，但能防止质量继续变差。",
      "工程效能平台常见做法是：CI 里跑单测，生成覆盖率，和基线对比，只检查本次 diff 涉及的行或文件。你如果能讲清这个思路，会比单纯会 lcov 命令更有竞争力。"
    ],
    points: [
      "总覆盖率看整体质量趋势",
      "增量覆盖率守住新代码质量",
      "门禁规则要可解释，不要一刀切",
      "覆盖率下降需要能定位到具体文件和提交"
    ],
    practice: "设计一个增量覆盖率门禁：规则、例外情况、报告展示、失败后开发应该怎么处理。"
  },
  {
    title: "gcov/lcov/llvm-cov 的工程流程",
    body: [
      "不同工具命令不同，但流程类似：编译时插桩，运行测试生成原始数据，收集数据，过滤路径，生成 HTML 或 XML 报告，上传到 CI 制品或质量平台。",
      "真正难点在于复杂工程：多 target、多测试进程、多目录、远程执行、路径不一致、报告合并。你要慢慢积累这些问题的处理方法。"
    ],
    code: "# GCC + lcov 常见流程\ncmake -S . -B build -DENABLE_COVERAGE=ON\ncmake --build build\nctest --test-dir build\nlcov --capture --directory build --output-file coverage.info\nlcov --remove coverage.info '*/tests/*' '*/third_party/*' --output-file coverage.filtered.info\ngenhtml coverage.filtered.info --output-directory coverage_html",
    interview: "我理解覆盖率从编译插桩、测试执行、数据收集、路径过滤到报告生成的完整流程，也能结合 CI 做增量覆盖率和质量门禁。"
  }
);

Object.assign(TOPICS, {
  "dds-someip": simpleTopic("智驾通信和平台 · Middleware", "DDS、SOME/IP", "DDS 更偏高吞吐发布订阅，SOME/IP 更偏车载服务通信。你要理解它们解决的是模块间通信、服务发现、数据分发和接口稳定性问题。", ["通信模型", "服务发现", "QoS/可靠性", "序列化", "车端部署"], "画出 HMI server、规划、感知、底盘之间可能使用的通信链路，并标出哪些适合发布订阅、哪些适合请求响应。"),
  ros2: simpleTopic("智驾通信和平台 · ROS2", "ROS2", "ROS2 比 ROS1 更贴近工程部署，底层基于 DDS，强调 QoS、组件化和多执行器。学 ROS2 能帮你理解现代机器人和智驾工具链。", ["Node", "Topic/Service/Action", "Executor", "QoS", "rosbag2"], "写一个 ROS2 节点发布车辆状态，再写一个订阅节点统计频率和延迟。"),
  protobuf: simpleTopic("智驾通信和平台 · Protocol", "protobuf", "protobuf 是跨语言接口协议，适合定义模块之间的数据结构。它比 JSON 更稳定、更适合高频数据和强类型接口。", ["proto3 语法", "message", "enum", "字段兼容", "序列化反序列化"], "定义一个 HMI 状态 proto，包括模块状态、错误码、时间戳，并写一段序列化/反序列化代码。"),
  "hmi-backend": simpleTopic("智驾通信和平台 · HMI", "HMI 与后端通信", "HMI 不是只做界面，它是用户看到智驾状态的窗口。后端要保证状态准确、及时、可解释，不能乱跳、不能误报。", ["状态同步", "事件上报", "错误码映射", "节流与去抖", "接口稳定性"], "设计一个 HMI server 状态聚合模块：输入多个模块心跳和状态，输出统一 HMI 状态。"),
  "logging-replay-record": simpleTopic("智驾通信和平台 · Data", "日志、回放、数据录制", "日志和回放是智驾问题闭环的基础。没有可回放数据，很多问题只能靠猜；有高质量数据，问题可以复现、定位、回归。", ["日志分级", "关键字段", "数据录制", "回放复现", "问题闭环"], "为一个模块设计日志规范：哪些 INFO，哪些 WARN，哪些 ERROR，哪些字段必须带时间戳和 trace id。"),
  "python-automation": simpleTopic("测试开发和仿真 · Python", "Python 自动化框架", "Python 是测试开发的效率工具。重点不是写零散脚本，而是把用例、数据、执行、报告、日志组织成框架。", ["框架分层", "数据驱动", "日志报告", "接口封装", "失败重试"], "写一个小型自动化框架目录：cases、drivers、utils、reports，并实现一个可重复执行的测试入口。"),
  pytest: simpleTopic("测试开发和仿真 · pytest", "pytest", "pytest 能把 Python 自动化测试组织得清晰可维护。fixture 管准备工作，参数化管多组数据，mark 管用例分类。", ["fixture", "parametrize", "mark", "插件", "报告"], "用 pytest 写 5 个接口测试，并用参数化覆盖正常、边界和异常输入。"),
  cicd: simpleTopic("测试开发和仿真 · CI/CD", "CI/CD", "CI/CD 是把编译、测试、覆盖率、静态检查自动化执行的工程体系。它能让质量要求稳定落地，而不是靠人记得跑。", ["流水线阶段", "质量门禁", "制品管理", "自动回归", "失败通知"], "设计一条智驾模块流水线：编译、单测、覆盖率、静态检查、报告归档。"),
  "scenario-generation": simpleTopic("测试开发和仿真 · Scenario", "scenario 场景生成", "场景生成是仿真评测的核心。你要把真实道路问题抽象成可参数化的场景，比如 cut-in、跟车、行人横穿、静态障碍物。", ["场景抽象", "参数空间", "边界条件", "危险场景", "KPI"], "设计一个 cut-in 场景模板，列出速度、距离、切入角度、天气、车道线等参数。"),
  "rosbag-replay": simpleTopic("测试开发和仿真 · Replay", "rosbag / 数据回放", "数据回放能把一次路测问题变成可重复验证的测试资产。重点是时间同步、topic 完整性和回放后指标是否一致。", ["录制", "裁剪", "回放", "时间同步", "问题复现"], "拿一个 bag，裁剪出问题前后 30 秒，并记录关键 topic、频率和异常字段。"),
  "simulation-basic": simpleTopic("测试开发和仿真 · Simulation", "Carla / LGSVL / 仿真基础", "仿真不是游戏，而是为了批量验证智驾系统在危险、边界和低频场景下的表现。你要关注场景、传感器、交通参与者和指标。", ["仿真地图", "传感器配置", "交通参与者", "评测指标", "自动化回归"], "搭一个最小仿真用例：自车直行，前车急刹，输出碰撞、最小 TTC、最大减速度等指标。")
});

function simpleTopic(eyebrow, title, lead, points, practice) {
  return {
    eyebrow,
    title,
    lead,
    chapters: [
      {
        title: "为什么要学",
        body: [
          lead,
          "这类知识的价值在于把单点经验升级成工程能力。面试时，别人问你做过什么，你不能只回答“用过”，而要能讲清它解决什么问题、在系统里处于什么位置、常见坑是什么。"
        ],
        points
      },
      {
        title: "核心概念",
        body: [
          `学习 ${title} 时，不要只背名词。先建立结构：它的输入是什么，输出是什么，谁调用它，失败会影响哪个模块，怎样观测和调试。`,
          "把概念放回智驾链路里理解，会比孤立看教程更快。比如通信类知识要联想到模块接口，测试类知识要联想到回归和指标。"
        ],
        points
      },
      {
        title: "工程应用",
        body: [
          "工程应用阶段，要关心稳定性、可维护性和可定位性。一个功能能跑起来只是第一步，真正上车或进 CI 后，还要能复现问题、记录日志、定位异常、支持回归。",
          "你可以把每个主题都和自己的经历挂钩：HMI server、覆盖率、功能测试、自动化测试，这些都是它们的落地点。"
        ],
        practice
      },
      {
        title: "面试表达",
        body: [
          `可以这样讲：我系统学习并实践过 ${title}，能结合智能驾驶模块的数据流、测试回归和工程质量场景落地使用。`,
          "更好的表达是带一个具体例子：我用它解决了什么问题、提升了什么效率、减少了什么风险。"
        ],
        interview: `围绕 ${title} 准备一个项目故事：背景、问题、你的方案、结果、复盘。`
      }
    ]
  };
}

const params = new URLSearchParams(location.search);
const topicKey = params.get("topic") || "ros-common";
const topic = TOPICS[topicKey] || TOPICS["ros-common"];

document.title = `${topic.title} - 智能驾驶成长路线`;
document.querySelector("#lessonEyebrow").textContent = topic.eyebrow;
document.querySelector("#lessonTitle").textContent = topic.title;
document.querySelector("#lessonLead").textContent = topic.lead;

const chapterNav = document.querySelector("#chapterNav");
const lessonBody = document.querySelector("#lessonBody");

chapterNav.innerHTML = topic.chapters
  .map((chapter, index) => `<a href="#chapter-${index + 1}">${index + 1}. ${chapter.title}</a>`)
  .join("");

lessonBody.innerHTML = topic.chapters
  .map((chapter, index) => renderChapter(chapter, index))
  .join("");

function renderChapter(chapter, index) {
  return `
    <section class="chapter" id="chapter-${index + 1}">
      <h2>${index + 1}. ${chapter.title}</h2>
      ${(chapter.body || []).map((paragraph) => `<p>${paragraph}</p>`).join("")}
      ${chapter.points ? `<ul>${chapter.points.map((item) => `<li>${item}</li>`).join("")}</ul>` : ""}
      ${chapter.code ? `<pre><code>${escapeHtml(chapter.code)}</code></pre>` : ""}
      ${chapter.practice ? `<div class="practice-box"><strong>练习任务</strong><p>${chapter.practice}</p></div>` : ""}
      ${chapter.interview ? `<div class="interview-box"><strong>面试表达</strong><p>${chapter.interview}</p></div>` : ""}
    </section>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
